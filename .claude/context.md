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
- **State Management**: NGXS (`@ngxs/store`) with a facade service (`ui/src/app/services/flag-store.ts`)
- **API Client**: Auto-generated from OpenAPI spec via `npm run generate:api-client`
- **Styling**: Angular Material + CSS custom properties
- **Dev Port**: 4200 with proxy to backend on 3000 (`ui/proxy.conf.json`)
- **Build Output**: `public/` (served by the Rust backend in production)

## Backend Key Components

### API Endpoints (`src/handlers/api/flags.rs`)

- `GET /api/flags` - List all flag definition files
- `POST /api/flags` - Create a new flags-file
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

The UI treats each flag definition file as a "flags-file" containing multiple feature flags.

### Flags-File Management

- **Sidebar** (`ui/src/app/components/flags-file-list/`) - Lists all flags-files, create new, delete
- **Flags-File Detail** (`ui/src/app/components/flags-file-detail/`) - Shows flags within a selected flags-file

### Flag Management

- **Flags-File Detail Table** (`ui/src/app/components/flags-file-detail/`) - Table/list view per flag showing key, type, state, variants, and targeting
- **Flag Editor** (`ui/src/app/components/flag-editor/`) - Form for creating/editing flags
  - Supports 4 flag types: boolean, string, number, object
  - Flag state: ENABLED / DISABLED
  - Variant management with type-appropriate inputs
  - Default variant selection

### Environment & Playground

- **Environment Manager** (`ui/src/app/components/environment-manager/`) - Manage `$evaluators` entries for multi-environment targeting
- **Playground Drawer** (`ui/src/app/components/playground-drawer/`) - Evaluate selected flags locally or against configured remote evaluators

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
- `/flags-files/local/:name` - Local flags-file detail view
- `/flags-files/remote/:backendId/:name` - Remote flags-file detail view

### Data Flow

- `FlagStore` (`ui/src/app/services/flag-store.ts`) is an NGXS facade used by components
- `FlagStoreState` (`ui/src/app/state/flag-store.state.ts`) owns flags-files, selected flags-file, flags, metadata, evaluators, backends, loading, and errors
- `UiPreferencesState` (`ui/src/app/state/ui-preferences.state.ts`) stores theme mode
- `PlaygroundPreferencesState` (`ui/src/app/state/playground-preferences.state.ts`) stores playground servers and drawer height
- NGXS storage plugin persists selected state slices (`flagStore.localFlagsFiles`, `flagStore.backends`, `uiPreferences.themeMode`, `playgroundPreferences.*`)
- API operates at file level; editing a single flag does read-modify-write of the full flags map
- `FlagsService` (`ui/src/app/api-client/api/flags.service.ts`) is auto-generated from OpenAPI spec

### Models (`ui/src/app/models/flag.models.ts`)

- `FlagsFileEntry`: file name + source (`local`/`remote`) + optional backend URL
- `FlagDefinition`: state, variants, defaultVariant, targeting, metadata
- `FlagEntry`: FlagDefinition + key
- `FlagFileContent`: $schema + flags map
- `Environment`/`Evaluator`: multi-environment targeting model types
- `inferFlagType()`: determines flag type from variant values
- `getDefaultVariants()`: returns default variants for a given type

### Naming Convention Notes

- Current UI terminology is `flags-file` (routes, state actions/selectors, and primary store facade methods).
- Legacy `project` component files may still exist in `ui/src/app/components/project-list/` as unused leftovers; active UI uses `flags-file-*` components.

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
- `ui/src/app/state/` - NGXS states and action definitions
- `ui/src/app/services/flag-store.ts` - NGXS facade consumed by UI components
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
npm test -- --watch=false  # Run unit tests (Vitest)
npm run lint         # Run ESLint
npm run lint -- --fix  # Auto-fix ESLint issues
```

### Frontend formatting requirements (for Claude agents)

When changing frontend files in `ui/` (especially `ui/src/**/*.ts`, `ui/src/**/*.html`, `ui/src/**/*.scss`, and `ui/**/*.json`):

1. Follow the project's Prettier config in `ui/package.json`.
2. Run Prettier before finishing work.

Commands:

```bash
cd ui && npm run format:check
cd ui && npm run format
```

For minimal diffs, format only changed files:

```bash
cd ui && npx prettier --write <changed-files>
```

### Frontend theming requirements (for Claude agents)

The UI supports both light and dark themes. New or updated frontend components must be theme-aware.

1. Never hard-code semantic UI colors in component styles (for example `#fafafa`, `#f5f5f5`, `#e0e0e0`, or `rgba(0, 0, 0, ...)`) for text, borders, surfaces, or state colors.
2. Use the shared CSS theme variables from `ui/src/styles.scss`, especially:

- `--color-bg`
- `--color-surface`
- `--color-border`
- `--color-text`
- `--color-text-secondary`
- `--color-primary`, `--color-danger`, etc. for semantic states

3. Keep Angular Material-driven colors coming from Material theme tokens in `ui/src/material-theme.scss`; avoid overriding Material internals with fixed colors.
4. For dialogs/cards/rows in new features (including environment management UIs), ensure backgrounds, borders, labels, and helper text all use the shared theme variables so they render correctly in both `html` and `html[data-theme='dark']` modes.
5. During review, grep changed SCSS for hard-coded color literals and replace them with theme tokens unless the value is intentionally non-theme semantic (for example translucent overlay/backdrop effects).

### Full stack dev

1. Terminal 1: `cargo run` (API on :3000)
2. Terminal 2: `cd ui && npm start` (UI on :4200 with proxy)

## Persisted UI requirements (flag editing)

These are required behaviors from recent UI changes and should be preserved unless explicitly redefined.

1. Use route-based edit pages so the selected flag is in the URL path.

- Local: `/flags-files/local/:name/edit/new` and `/flags-files/local/:name/edit/:flagKey`
- Remote: `/flags-files/remote/:backendId/:name/edit/new` and `/flags-files/remote/:backendId/:name/edit/:flagKey`

2. Below `1280px`, create/edit must navigate to routed edit page (no side panel behavior).
3. At/above `1280px`, keep inline detail editing; provide expand action to open routed edit page.
4. In routed edit page (large screens), show an unexpand action to return to detail view.
5. Below `1920px`, save/create closes editing; at/above `1920px`, keep editor open.
6. Playground drawer must be available in routed edit page as well as detail view.
7. Routed edit page layout must be full-width, have a scrollable workspace above playground, and include padding so card borders are visible and actions are not overlapped by expanded playground.

## Recent E2E learnings (Feb 2026)

1. New Playwright E2E spec exists at `e2e-tests/boolean-flag-playground.spec.ts` and uses the real backend (no API route mocking).
2. Expected flow covered by this spec:

- Create a new local flags-file from the sidebar dialog.
- Create a boolean flag in Easy mode.
- Evaluate in Playground and assert initial result `Value: true`, `Variant: on`.
- Re-open flag editor and toggle the Easy mode global boolean switch from ON to OFF.
- Save and re-evaluate, then assert `Value: false`, `Variant: off`.

3. Cross-browser validation command used successfully:

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test e2e-tests/boolean-flag-playground.spec.ts --project=chromium --project=firefox --project=webkit --trace=on --reporter=line
```

4. Trace artifacts from this run are in:

- `test-results/boolean-flag-playground-cr-5453b-yground-then-switches-value-chromium/trace.zip`
- `test-results/boolean-flag-playground-cr-5453b-yground-then-switches-value-firefox/trace.zip`
- `test-results/boolean-flag-playground-cr-5453b-yground-then-switches-value-webkit/trace.zip`

5. If `npx playwright show-trace <trace.zip>` fails with `Protocol error (Browser.getVersion)`, use hosted mode and an absolute path:

```bash
npx playwright show-trace --host 127.0.0.1 --port 9324 /workspaces/flagd-ui/test-results/boolean-flag-playground-cr-5453b-yground-then-switches-value-chromium/trace.zip
```

## Claude Agent Workflow Commitments

When working on this codebase, the following practices must be followed:

1. **Build Verification**: Always run `get_errors()` after making any changes to:
   - Component files (`.ts`)
   - Templates (`.html`)
   - Styles (`.scss`)
   - Configuration files

2. **Fix All Errors**: Do not consider a task complete until all compilation/lint errors are resolved.

3. **Code Formatting**: After making changes to frontend files in `ui/`:
   - Run `npm run format:check` to validate formatting
   - Run `npm run format` to auto-format if needed
   - Ensure Prettier config in `ui/package.json` is respected

4. **Theme Awareness**: When modifying or creating UI components:
   - Use theme variables from `ui/src/styles.scss` (`--color-bg`, `--color-surface`, `--color-text`, etc.)
   - Never hard-code semantic colors
   - Ensure components work in both light and dark themes
   - Reference Material theme tokens from `ui/src/material-theme.scss` when using Material components

5. **Import Missing Dependencies**: When using Material components or other dependencies in templates:
   - Verify all required imports are present in the component's `.ts` file
   - Add missing module imports to the `imports` array in `@Component()`
   - Example: If adding `mat-divider`, import `MatDividerModule`

6. **Documentation**: Update this context file when:
   - Adding new architectural patterns or components
   - Establishing new workflow requirements or best practices
   - Documenting important learnings or gotchas
