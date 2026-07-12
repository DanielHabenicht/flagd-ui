# ─── Backend build: .NET API (also emits the OpenAPI document to ui/) ─────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-builder

WORKDIR /app

# ui/ must exist so the API's OpenApiGenerateDocumentsOnBuild target can emit
# ui/openapi.json (see OpenFeatureManager.Api.csproj).
RUN mkdir -p ui

COPY src ./src
COPY schema ./schema

# Bootsharp compiles the WASM project into an npm package at
# src/OpenFeatureManager.Wasm/bin/bootsharp (consumed by the UI via a file:
# dependency). browser-wasm publishing needs the wasm-tools workload; Debug
# skips the heavy NativeAOT-LLVM path — the REST image never runs the wasm, it
# only needs the generated bindings so the frontend compiles.
RUN dotnet workload install wasm-tools

# The browser-wasm native compile needs python (emscripten/emcc); Bootsharp's
# post-build step bundles its JS with `npx rollup`, so node + rollup are needed too.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 nodejs npm \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && npm install -g rollup \
    && rm -rf /var/lib/apt/lists/*

RUN dotnet publish src/OpenFeatureManager.Wasm/OpenFeatureManager.Wasm.csproj -c Debug

RUN dotnet publish src/OpenFeatureManager.Api/OpenFeatureManager.Api.csproj \
    -c Release \
    -o /app/publish


# ─── OpenAPI document artifact (consumed by CI docker-image.yml) ──────────────
# The API emits its document as OpenFeatureManager.Api.json (see the csproj and
# scripts/setup-api-client.js); expose it as openapi.json for downstream tooling.
FROM scratch AS artifacts

COPY --from=backend-builder /app/ui/OpenFeatureManager.Api.json /openapi.json


# ─── Generate the typescript-angular API client from the OpenAPI document ─────
FROM openapitools/openapi-generator-cli:v7.21.0 AS api-client-generator

WORKDIR /local

COPY --from=backend-builder /app/ui/OpenFeatureManager.Api.json /local/openapi.json

RUN openapi-generator-cli generate \
    -i /local/openapi.json \
    -g typescript-angular \
    -o /local/api-client


# ─── Frontend build: Angular UI ───────────────────────────────────────────────
FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /ui

# schema/ is resolved as ../../schema by the schema-type generator.
COPY schema /schema

# The bootsharp package is a file: dependency at ../src/.../bin/bootsharp
# relative to ui/; it must exist before npm ci links it into node_modules.
COPY --from=backend-builder /app/src/OpenFeatureManager.Wasm/bin/bootsharp /src/OpenFeatureManager.Wasm/bin/bootsharp

COPY ui/package*.json ./
RUN npm ci --ignore-scripts

COPY ui/ ./
COPY --from=api-client-generator /local/api-client ./src/app/api-client

# REST backend, served same-origin by the API container.
ENV FLAGD_UI_BACKEND_TYPE=rest

# generate:api-client applies the post-generation patches to the client copied
# from the generator stage (the OpenAPI spec is absent here, so it skips the
# generation step itself). generate:schema-types and generate-environments are
# the same scripts npm runs via postinstall/prebuild.
RUN npm run generate:api-client \
    && node scripts/generate-environments.js \
    && npm run generate:schema-types \
    && npm run ng -- build --configuration production


# ─── Runtime: ASP.NET serving the API + built UI on one port ──────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

WORKDIR /app

COPY --from=backend-builder /app/publish ./
COPY --from=frontend-builder /public ./wwwroot
COPY schema ./schema

# SQLite database lives in a world-writable dir so the container can run as an
# arbitrary (docker-compose provided) UID.
RUN mkdir -p /app/data && chmod 777 /app/data

ENV ASPNETCORE_URLS=http://+:3000 \
    ConnectionStrings__Flagd="Data Source=/app/data/flagd.db" \
    FlagdSchemaFile=./schema/flagd-schema.json

EXPOSE 3000

ENTRYPOINT ["dotnet", "OpenFeatureManager.Api.dll"]
