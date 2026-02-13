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
