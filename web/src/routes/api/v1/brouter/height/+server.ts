import { env } from '$env/dynamic/public';
import { error, json, type NumericRange, type RequestEvent } from "@sveltejs/kit";
import { decodePolyline } from '$lib/util/polyline_util';


export async function POST(event: RequestEvent) {
    const data = await event.request.json()
    if (!env.PUBLIC_BROUTER_URL) {
        return error(400, "PUBLIC_BROUTER_URL not set")
    }
    try {
        const encoded = data.encoded_polyline;
        if (!encoded) {
            return error(400, "encoded_polyline missing")
        }

        const points = decodePolyline(encoded); // returns [lon, lat] pairs
        if (!points.length) {
            return json({ height: [] });
        }

        const lonlats = points.map((p: number[]) => `${p[0]},${p[1]}`).join('|');

        // Choose a default profile; Brouter may include elevation in returned coords
        const profile = 'gravel';
        const url = `${env.PUBLIC_BROUTER_URL.replace(/\/$/, '')}/brouter?lonlats=${encodeURIComponent(lonlats)}&profile=${encodeURIComponent(profile)}&format=geojson&elevation=true`;

        const r = await event.fetch(url);
        if (!r.ok) {
            const text = await r.text();
            throw error(r.status as NumericRange<400,500>, text);
        }

        const geo = await r.json();
        const coords: number[][] = geo?.features?.[0]?.geometry?.coordinates;
        if (!coords || !coords.length) {
            // return zero heights matching original points
            return json({ height: points.map(() => 0) });
        }

        // If returned coords include elevation as third element, use it. Otherwise fall back to zeros.
        let heights: number[] = [];
        if (coords[0].length >= 3 && coords.length === points.length) {
            heights = coords.map(c => Number(c[2] || 0));
        } else {
            // lengths differ or no elevation: attempt best-effort mapping by index
            heights = points.map((_, i) => (coords[i] && coords[i].length >= 3) ? Number(coords[i][2]) : 0);
        }

        return json({ height: heights });
    } catch (e: any) {
        throw error(e.status || 500, e)
    }
}
