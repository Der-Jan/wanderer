import { env } from '$env/dynamic/public';
import { json, type RequestEvent } from "@sveltejs/kit";
import { encodePolyline } from '$lib/util/polyline_util';
import { haversineDistance } from '$lib/models/gpx/utils';


export async function POST(event: RequestEvent) {
    const data = await event.request.json()
    if (!env.PUBLIC_BROUTER_URL) {
        return json({ message: "PUBLIC_BROUTER_URL not set" }, { status: 400 })
    }
    try {
        const locations = data.locations || [];
        if (!locations.length) {
            return json({ message: "no locations provided" }, { status: 400 })
        }

        // Build lonlats string for Brouter (lon,lat|lon,lat|...)
        const lonlats = locations.map((l: any) => `${l.lon},${l.lat}`).join("|");

        // Map Valhalla costing to Brouter profile
        const profileMap: Record<string, string> = { bicycle: 'gravel', pedestrian: 'all', auto: 'car-vario' };
        const profile = profileMap[String(data.costing || 'bicycle') as any] || 'gravel';

        const url = `${env.PUBLIC_BROUTER_URL.replace(/\/$/, '')}/brouter?lonlats=${encodeURIComponent(lonlats)}&profile=${encodeURIComponent(profile)}&format=geojson`;

        const r = await event.fetch(url);
        if (!r.ok) {
            const responseText = await r.text();
            return json({ message: responseText }, { status: r.status })
        }

        const geo = await r.json();
        const coords: number[][] = geo?.features?.[0]?.geometry?.coordinates;
        if (!coords || !coords.length) {
            return json({ message: "empty route from brouter" }, { status: 502 })
        }

        // encode polyline expected by frontend (encodePolyline expects [lat, lon] pairs)
        const shape = encodePolyline(coords.map(c => [c[1], c[0]]));

        // compute length (meters) and bounding box
        let length = 0;
        let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
        for (let i = 1; i < coords.length; i++) {
            const [lon1, lat1] = coords[i - 1];
            const [lon2, lat2] = coords[i];
            length += haversineDistance(lat1, lon1, lat2, lon2);
        }
        for (const [lon, lat] of coords) {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
        }

        // prefer Brouter-provided total time when available; otherwise set to 0
        const props = geo?.features?.[0]?.properties || {};
        const brouterTime = props['total-time'] ?? props['total_time'] ?? props.totalTime ?? props.total_time_seconds ?? props['total_time_seconds'];
        let timeSeconds: number;
        if (brouterTime != null) {
            const asNum = Number(brouterTime);
            timeSeconds = Number.isFinite(asNum) ? Math.round(asNum) : 0;
        } else {
            timeSeconds = 0;
        }

        const trip = {
            locations: locations.map((l: any, i: number) => ({ type: 'break', lat: l.lat, lon: l.lon, original_index: i })),
            legs: [{ summary: { has_time_restrictions: false, has_toll: false, has_highway: false, has_ferry: false, min_lat: minLat, min_lon: minLon, max_lat: maxLat, max_lon: maxLon, time: timeSeconds, length: length, cost: 0 }, shape }],
            summary: { has_time_restrictions: false, has_toll: false, has_highway: false, has_ferry: false, min_lat: minLat, min_lon: minLon, max_lat: maxLat, max_lon: maxLon, time: timeSeconds, length: length, cost: 0 },
            status_message: 'OK',
            status: 0,
            units: 'm',
            language: 'en'
        };

        return json({ trip });
    } catch (e: any) {
        return json({ message: e?.toString() || 'unknown error' }, { status: 500 })
    }
}
