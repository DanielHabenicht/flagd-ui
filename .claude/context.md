# Claude Context for flagd-ui

## Project Overview

This is a web UI for the OpenFeature flagd service, built with Rust and Axum. It provides a web interface for managing feature flags in flagd - a simple, self-contained, vendor-neutral feature flag evaluation engine.

- **Related Projects**:
  - OpenFeature: https://github.com/open-feature
  - flagd: https://flagd.dev/

## Architecture

- **Web Framework**: Axum (lightweight, async Rust web framework)
- **Async Runtime**: Tokio
- **Middleware**: Tower for HTTP middleware
- **Static Files**: Served via tower-http

## Key Components

### Handlers (`src/handlers/`)
- API endpoints for feature flag operations
- Health check endpoints
- Static file serving

### Configuration (`src/config.rs`)
- Application configuration management

### Error Handling (`src/error.rs`)
- Centralized error types and handling

## Development Notes

- Rust version: 1.93+
- Follow Rust idioms and best practices
- Use async/await patterns with Tokio
- API responses should use JSON (serde_json)

## Important Files

- `Cargo.toml`: Dependencies and project metadata
- `src/main.rs`: Application entry point
- `flags/`: Feature flag definitions directory
- `public/`: Frontend static assets

## Testing

When making changes:
1. Ensure code compiles: `cargo check`
2. Run tests: `cargo test`
3. Check formatting: `cargo fmt`
4. Run linter: `cargo clippy`
