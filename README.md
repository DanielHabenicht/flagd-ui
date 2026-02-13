# flagd-ui

A web UI for managing feature flags in [OpenFeature](https://github.com/open-feature) [flagd](https://flagd.dev/) service, built with Rust and Axum.

## About

This project provides a user-friendly web interface for the OpenFeature flagd service - a simple, self-contained feature flag evaluation engine. flagd is designed to be vendor-neutral and follows the OpenFeature specification.

## Tech Stack

- **Backend**: Rust with Axum web framework
- **Runtime**: Tokio async runtime
- **Frontend**: Static files served from `public/`

## Project Structure

```
flagd-ui/
├── src/           # Rust source code
│   ├── config.rs  # Configuration
│   ├── error.rs   # Error handling
│   └── handlers/  # HTTP request handlers
├── public/        # Static web assets
├── flags/         # Feature flag definitions
└── Cargo.toml     # Rust dependencies
```

## Development

### Prerequisites

- Rust 1.93 or later
- Cargo

### Running Locally

```bash
cargo run
```

Running the backend normally does not regenerate `public/openapi.json`.

### Building

```bash
cargo build --release
```

Building the backend generates `public/openapi.json` locally from the current API annotations.

## Docker

A Docker Compose setup is available:

```bash
docker-compose up
```
