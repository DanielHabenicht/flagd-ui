# Claude Context for flagd-ui

## Project Overview

This is a web UI for the OpenFeature flagd service. It provides a web interface for managing feature flags in flagd - a simple, self-contained, vendor-neutral feature flag evaluation engine.

- **Related Projects**:
  - OpenFeature: https://github.com/open-feature
  - flagd: https://flagd.dev/

## Architecture

Full-stack application with a Rust backend and Angular frontend.

### Backend (Rust/Axum)
- **Web Framework**: Axum 0.7
- **Async Runtime**: Tokio
- **Middleware**: Tower (compression, tracing, static file serving)
- **Validation**: JSON Schema v7 via `jsonschema` crate against `schema/flagd-schema.json`
- **API Docs**: OpenAPI 3.1.0 via utoipa, Swagger UI at `/swagger-ui`
- **Port**: 3000 (configurable via `SERVER_PORT` env var)

### Frontend (Angular 21)
- **Framework**: Angular 21 with standalone components
- **State Management**: Signal-based `FlagStore` service (`ui/src/app/services/flag-store.ts`)
- **API Client**: Auto-generated from OpenAPI spec via `npm run generate:api-client`
- **Styling**: Plain CSS with CSS custom properties (no component library)
- **Dev Port**: 4200 with proxy to backend on 3000 (`ui/proxy.conf.json`)
- **Build Output**: `public/` (served by the Rust backend in production)

## Backend Key Components

### API Endpoints (`src/handlers/api/flags.rs`)
- `GET /api/flags` - List all flag definition files
- `POST /api/flags` - Create a new flag file (project)
- `GET /api/flags/:name` - Get a flag file's contents
- `PUT /api/flags/:name` - Update a flag file
- `DELETE /api/flags/:name` - Delete a flag file

### Health (`src/handlers/health.rs`)
- `GET /health` - Liveness check
- `GET /ready` - Readiness check

### Configuration (`src/config.rs`)
- `SERVER_PORT` (default: 3000)
- `STATIC_DIR` (default: `./public`)
- `FLAGS_DIR` (default: `./flags`)
- `FLAGD_SCHEMA_FILE` (default: `./schema/flagd-schema.json`)

### Error Handling (`src/error.rs`)
- `AppError` enum: NotFound, BadRequest, InternalServerError
- Returns JSON `{ error, status }`

## Frontend Features

The UI treats each flag definition file as a "project" containing multiple feature flags.

### Project Management
- **Sidebar** (`ui/src/app/components/project-list/`) - Lists all projects, create new, delete
- **Project Detail** (`ui/src/app/components/project-detail/`) - Shows flags within a selected project

### Flag Management
- **Flag Cards** (`ui/src/app/components/flag-card/`) - Summary view per flag showing type, state, variants, targeting badge
- **Flag Editor** (`ui/src/app/components/flag-editor/`) - Modal form for creating/editing flags
  - Supports 4 flag types: boolean, string, number, object
  - Flag state: ENABLED / DISABLED
  - Variant management with type-appropriate inputs
  - Default variant selection

### Variant Editor (`ui/src/app/components/variants-editor/`)
- Dynamic rows for adding/removing variants
- Boolean: true/false select
- String: text input
- Number: number input
- Object: JSON textarea with validation

### Targeting Rules Editor (`ui/src/app/components/targeting-editor/`)
- **None mode**: No targeting rules
- **Simple mode**: If / property / operator / value / then-variant / else-variant builder
  - Operators: equals, not equals, in list, starts with, ends with
- **JSON mode**: Raw JSONLogic editor with templates (condition, fractional)

### Routing (`ui/src/app/app.routes.ts`)
- `/` - Welcome page
- `/projects/:name` - Project detail view

### Data Flow
- `FlagStore` (`ui/src/app/services/flag-store.ts`) centralizes all state via Angular signals
- API operates at file level; editing a single flag does read-modify-write of the full flags map
- `FlagsService` (`ui/src/app/api-client/api/flags.service.ts`) is auto-generated from OpenAPI spec

### Models (`ui/src/app/models/flag.models.ts`)
- `FlagDefinition`: state, variants, defaultVariant, targeting, metadata
- `FlagEntry`: FlagDefinition + key
- `FlagFileContent`: $schema + flags map
- `inferFlagType()`: determines flag type from variant values
- `getDefaultVariants()`: returns default variants for a given type

## Schema (`schema/`)

- `flagd-schema.json` - JSON Schema v7 for flag definition files. Defines boolean, string, number, and object flag types with state, variants, defaultVariant, targeting, and metadata.
- `targeting.json` - JSONLogic-based targeting rules schema. Supports: if, var, equality/comparison operators, logical operators, string comparisons, fractional distribution, semantic versioning.

## Important Files

- `Cargo.toml` - Rust dependencies
- `src/main.rs` - Server entry point, router setup
- `flags/` - Flag definition JSON files (e.g. `demo.flagd.json`)
- `schema/` - JSON Schema definitions
- `ui/package.json` - Angular dependencies and scripts
- `ui/angular.json` - Angular CLI configuration
- `ui/src/app/app.config.ts` - Angular providers (router, HTTP, API client)
- `ui/src/app/api-client/` - Auto-generated API client (do not edit manually)
- `public/` - Built Angular assets (generated by `cd ui && npm run build`)

## Development

### Backend
```
cargo check    # Compile check
cargo test     # Run tests
cargo fmt      # Format code
cargo clippy   # Lint
cargo run      # Start server on port 3000
```

### Frontend
```
cd ui
npm install          # Install dependencies
npm start            # Dev server on port 4200 (proxies /api to :3000)
npm run build        # Production build to ../public
npm run generate:api-client  # Regenerate API client from OpenAPI spec
```

### Full stack dev
1. Terminal 1: `cargo run` (API on :3000)
2. Terminal 2: `cd ui && npm start` (UI on :4200 with proxy)
