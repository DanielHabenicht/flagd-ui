# Development

## Prerequisites

- Rust 1.93+
- Cargo
- Node.js and npm (for the frontend)

## Backend

```bash
cargo run
```

## Frontend

```bash
cd ui
npm install
npm run start
```

## Build backend release

```bash
cargo build --release
```

## Backend format and validity checks

Run these before opening a PR:

```bash
cargo fmt --all -- --check
cargo check --all-targets
cargo test --all-targets
```

GitHub Actions runs the same checks automatically in `.github/workflows/rust-backend-checks.yml` on pushes and pull requests to `main`.

## Tech Stack

- **Backend**: Rust with Axum web framework
- **Runtime**: Tokio async runtime
- **Storage**: Local filesystem or Azure Blob Storage
- **Frontend**: Static files served from `public/`

## Project Structure

```
flagd-ui/
├── src/              # Rust source code
│   ├── config.rs     # Configuration & CLI arguments
│   ├── error.rs      # Error handling
│   ├── storage/      # Storage backend implementations
│   │   ├── mod.rs    # Storage abstraction trait
│   │   ├── local.rs  # Local filesystem backend
│   │   └── azure.rs  # Azure Blob Storage backend
│   └── handlers/     # HTTP request handlers
├── public/           # Static web assets
├── flags/            # Default feature flag definitions directory
├── docs/             # Documentation
│   └── azure-storage.md  # Azure Blob Storage documentation
└── Cargo.toml        # Rust dependencies
```

## Storage Backends

flagd-ui supports multiple storage backends for feature flag files:

- **Local Filesystem** (default): Stores flags in a local directory
- **Azure Blob Storage**: Stores flags in Azure Blob Storage containers

See [docs/azure-storage.md](docs/azure-storage.md) for detailed information on storage backends.

## Development

### Prerequisites

- Rust 1.93 or later
- Cargo

### Running Locally

```bash
# Run with default local storage (./flags directory)
cargo run

# Run with custom local storage directory
cargo run -- --storage-uri ./my-flags

# Run with Azure Blob Storage (using connection string)
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=...;EndpointSuffix=core.windows.net"
cargo run -- --storage-uri https://myaccount.blob.core.windows.net/feature-flags

# Or use connection string directly
cargo run -- --storage-uri "DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=...;Container=feature-flags"

# View all CLI options
cargo run -- --help
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
