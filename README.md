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

## Documentation (GitHub Pages)

Project docs are generated with [Zensical](https://zensical.org/docs/get-started/).

### Build docs locally

Generate the UI screenshot used in the docs:

```bash
npm ci
npm run e2e:docs-screenshot
```

Then start a local preview:

```bash
uvx zensical serve
```

Open `http://localhost:8000` to preview docs.

To build static output:

```bash
uvx zensical build --clean
```

Generated static files are written to `site/`.

## Docker

A unified multi-stage Docker build is available and compiles both backend and frontend into one image:

```bash
docker build -t flagd-ui .
docker run --rm -p 3000:3000 flagd-ui
```

The Docker Compose setup is available for a local preview (both `flagd-ui` and `flagd`):

```bash
docker compose up --build
```

The `flagd-ui` service runs with your host UID/GID (`${UID:-1000}:${GID:-1000}`) so it can write to the bind-mounted `./flags` directory.
If your local UID/GID is not `1000`, export them before starting Compose:

```bash
export UID=$(id -u)
export GID=$(id -g)
docker compose up --build
```

## Automated Docker Releases (GitHub)

The workflow at `.github/workflows/docker-image.yml` publishes Docker images when a tag matching `v*` is pushed.

- It verifies the tagged commit is reachable from `main`.
- It then builds and pushes the image to GitHub Container Registry:
	- `ghcr.io/<owner>/<repo>:latest`
	- `ghcr.io/<owner>/<repo>:<version>`
	- `ghcr.io/<owner>/<repo>:v<version>`
	- `ghcr.io/<owner>/<repo>:<major>.<minor>`
	- `ghcr.io/<owner>/<repo>:<major>`

Where `<version>` is derived from the tag name (for example, `v1.2.3` -> `1.2.3`).

No extra secrets are required for the default setup; the workflow uses the built-in `GITHUB_TOKEN`.
