FROM golang:1-alpine AS builder
ARG TARGETARCH

RUN mkdir /pocketbase
WORKDIR /pocketbase
COPY . .

ENV GOOS=linux 
ENV GOARCH=amd64 
ENV CGO_ENABLED=0 
RUN go build -o pocketbase_${TARGETARCH}


FROM alpine:3.19
ARG TARGETARCH

WORKDIR /

COPY migrations ./migrations
COPY templates ./templates

RUN echo ${TARGETARCH}
COPY --from=builder /pocketbase/pocketbase_${TARGETARCH} /pocketbase
RUN chmod +x /pocketbase

ENV MEILI_URL=http://localhost:7700
ENV MEILI_MASTER_KEY=

EXPOSE 8090

ENTRYPOINT ["/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data"]