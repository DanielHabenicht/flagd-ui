# wasm-tryout

A Rust library that ports the `FlagdSchemaAbstraction` TypeScript class to Rust.  
It ships the same business logic as both a **WebAssembly module** (callable from JavaScript) and a **native HTTP server** (REST API via Axum).

## Project layout

```
wasm-tryout/
├── Cargo.toml
└── src/
    ├── lib.rs         – library entry point
    ├── models.rs      – data models (FlagState, FlagType, DisplayFlag, Environment, …)
    ├── db.rs          – in-memory, multi-file database (Arc<RwLock<Database>>)
    ├── service.rs     – business logic (import_schema, export_schema, CRUD for flags/environments)
    ├── wasm.rs        – wasm-bindgen JS-invokable wrapper (compiled for wasm32 only)
    ├── controller.rs  – Axum REST controller (compiled for native targets only)
    └── main.rs        – native binary entry point
```

## Architecture

### Data layer (`db.rs`)

`Database` holds a `HashMap<String, FileState>` – one entry per managed flagd file.  
`FileState` stores:
- `environment_aliases` – maps lowercase env name to its string aliases  
- `flags_map` – maps flag key to `DisplayFlag`  
- `metadata` – optional file-level metadata map  

`SharedDatabase = Arc<RwLock<Database>>` provides thread-safe shared access for the server.

### Service layer (`service.rs`)

Pure functions operating on a `&Database` / `&mut Database`:

| Function | Description |
|---|---|
| `list_files` | Return all file names |
| `create_file` | Add an empty file slot |
| `delete_file` | Remove a file slot |
| `import_schema` | Parse a flagd JSON schema and populate the database |
| `export_schema` | Serialise internal state back to a flagd JSON schema |
| `get_flags` / `get_flag` | Read flags |
| `create_or_update_flag` | Upsert a flag (supports rename via `previous_key`) |
| `delete_flag` | Remove a flag |
| `get_environments` | Read environments |
| `create_or_update_environment` | Upsert an environment |
| `delete_environment` | Remove an environment |
| `get_metadata` / `set_metadata` | Read/write file-level metadata |

### WASM bindings (`wasm.rs`, wasm32 only)

`FlagdAbstractionStore` is a `#[wasm_bindgen]` struct that wraps a `Database` and exposes every service function as a JS-callable method.

Build with [wasm-pack](https://rustwasm.github.io/wasm-pack/):

```bash
wasm-pack build --target bundler   # for bundlers (webpack/vite)
wasm-pack build --target web       # for native ES modules
wasm-pack build --target nodejs    # for Node.js
```

JavaScript usage example:

```js
import { FlagdAbstractionStore } from './pkg/wasm_tryout.js';

const store = new FlagdAbstractionStore();
store.importSchema('demo', rawFlagdJsonString);

const flags = store.getFlags('demo');      // returns JS array
const schema = store.exportSchema('demo'); // returns JSON string
```

### REST controller (`controller.rs`, native only)

Axum router mounted under `/api`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/files` | List files |
| `POST` | `/api/files/:name` | Create file |
| `DELETE` | `/api/files/:name` | Delete file |
| `POST` | `/api/files/:name/import` | Import flagd JSON schema (body = raw JSON) |
| `GET` | `/api/files/:name/export` | Export flagd JSON schema |
| `GET` | `/api/files/:name/flags` | List flags |
| `GET` | `/api/files/:name/flags/:flag_key` | Get a single flag |
| `PUT` | `/api/files/:name/flags/:flag_key` | Create or update a flag |
| `DELETE` | `/api/files/:name/flags/:flag_key` | Delete a flag |
| `GET` | `/api/files/:name/environments` | List environments |
| `PUT` | `/api/files/:name/environments/:display_name` | Create or update an environment |
| `DELETE` | `/api/files/:name/environments/:display_name` | Delete an environment |
| `GET` | `/api/files/:name/metadata` | Get file metadata |
| `PUT` | `/api/files/:name/metadata` | Set file metadata |

## Running the server

```bash
cd wasm-tryout
PORT=3001 cargo run --bin wasm-tryout-server
```

## Running tests

```bash
cd wasm-tryout
cargo test
```
