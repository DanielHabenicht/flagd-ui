FROM rust:1.93-bookworm AS backend-builder

WORKDIR /app

COPY Cargo.toml ./
COPY build.rs ./
COPY src ./src
COPY schema ./schema
COPY flags ./flags

RUN mkdir -p ui

RUN cargo build --release


FROM openapitools/openapi-generator-cli:v7.19.0 AS api-client-generator

WORKDIR /local

COPY ui/.openapi-generator-ignore /local/.openapi-generator-ignore
COPY --from=backend-builder /app/ui/openapi.json /local/openapi.json

RUN openapi-generator-cli generate \
    -i /local/openapi.json \
    -g typescript-angular \
    -o /local/api-client


FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /ui

COPY ui/package*.json ./
RUN npm ci

COPY ui/ ./
COPY --from=api-client-generator /local/api-client ./src/app/api-client

RUN cp ./.openapi-generator-ignore ./src/app/api-client/.openapi-generator-ignore \
    && npm run ng -- build --configuration production


FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && adduser --system --group --no-create-home appuser

WORKDIR /app

COPY --from=backend-builder /app/target/release/flagd-ui /usr/local/bin/flagd-ui
COPY --from=frontend-builder /public ./public
COPY schema ./schema

ENV SERVER_PORT=3000 \
    STATIC_DIR=./public \
    FLAGS_DIR=./flags \
    FLAGD_SCHEMA_FILE=./schema/flagd-schema.json

EXPOSE 3000

USER appuser

ENTRYPOINT ["/usr/local/bin/flagd-ui"]