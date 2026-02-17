# Azure Blob Storage Backend

This implementation adds support for storing feature flags in Azure Blob Storage in addition to the local filesystem.

## Features

- **Storage Abstraction**: A trait-based design allows for multiple storage backends
- **Local Filesystem Storage**: Default behavior maintains backward compatibility
- **Azure Blob Storage**: Store flags in Azure Blob Storage containers
- **CLI Support**: Configure storage via command-line arguments or environment variables
- **Protocol-based Routing**: Automatically selects storage backend based on URI protocol

## Usage

### Local Filesystem (Default)

```bash
# Using default ./flags directory
cargo run

# Using custom directory
cargo run -- --storage-uri ./my-flags
cargo run -- --storage-uri file:///path/to/flags

# Or via environment variable
FLAGS_DIR=./my-flags cargo run
STORAGE_URI=file:///path/to/flags cargo run
```

### Azure Blob Storage

```bash
# Using Azure Blob Storage with connection string
cargo run -- --storage-uri "DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=...;EndpointSuffix=core.windows.net;Container=feature-flags"

# Or via environment variable
export STORAGE_URI="DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=...;EndpointSuffix=core.windows.net;Container=feature-flags"
cargo run
```

**Note**: The connection string must include the `Container=<name>` parameter to specify which container to use.

### Azurite (Local Development)

For local development and testing with Azure Blob Storage, you can use [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite), the Azure Storage emulator.

```bash
# Start Azurite using Docker Compose
docker compose up -d azurite

# Use Azurite with connection string
cargo run -- --storage-uri "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;Container=feature-flags"
```

## CLI Arguments

```
--storage-uri <STORAGE_URI>
    Storage URI for feature flags

    Supported formats:
    - Local filesystem: file:///path/to/flags or /path/to/flags or ./flags
    - Azure Blob Storage connection string: DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;Container=<container>

    [env: STORAGE_URI=]

--port <PORT>
    HTTP server port
    [env: SERVER_PORT=]
    [default: 3000]

--static-dir <STATIC_DIR>
    Directory for static files
    [env: STATIC_DIR=]
    [default: ./public]

--schema-file-path <SCHEMA_FILE_PATH>
    Path to the flagd JSON schema file
    [env: FLAGD_SCHEMA_FILE=]
    [default: ./schema/flagd-schema.json]
```

## Environment Variables

- `STORAGE_URI`: Storage URI (overrides `FLAGS_DIR`)
- `FLAGS_DIR`: Legacy environment variable for local storage path
- `SERVER_PORT`: HTTP server port (default: 3000)
- `STATIC_DIR`: Directory for static files (default: ./public)
- `FLAGD_SCHEMA_FILE`: Path to flagd JSON schema (default: ./schema/flagd-schema.json)

## Architecture

### Storage Abstraction

The storage system uses a trait-based design:

```rust
#[async_trait]
pub trait StorageBackend: Send + Sync {
    async fn list_flags(&self) -> AppResult<Vec<String>>;
    async fn read_flag(&self, name: &str) -> AppResult<serde_json::Value>;
    async fn write_flag(&self, name: &str, content: &serde_json::Value) -> AppResult<()>;
    async fn delete_flag(&self, name: &str) -> AppResult<()>;
    async fn flag_exists(&self, name: &str) -> AppResult<bool>;
}
```

### Storage Backends

1. **LocalStorage** (`src/storage/local.rs`): Stores flags in the local filesystem
2. **AzureStorage** (`src/storage/azure.rs`): Stores flags in Azure Blob Storage

### Factory Pattern

The `create_storage_backend` function automatically selects the appropriate backend based on the URI format:

- Connection string (contains `AccountName=` and `AccountKey=`) → Azure Blob Storage
- `file://` → Local filesystem
- Relative or absolute paths → Local filesystem (default)

## Testing

### Local Filesystem

```bash
# Start the server
cargo run

# Create a flag
curl -X POST http://localhost:3000/api/flags \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-flag",
    "flags": {
      "my-feature": {
        "state": "ENABLED",
        "variants": { "on": true, "off": false },
        "defaultVariant": "on"
      }
    }
  }'

# List flags
curl http://localhost:3000/api/flags

# Get a specific flag
curl http://localhost:3000/api/flags/test-flag

# Delete a flag
curl -X DELETE http://localhost:3000/api/flags/test-flag
```

### Azure Blob Storage

Same API calls as above, but configure the server to use Azure Blob Storage:

```bash
cargo run -- --storage-uri "DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=your-key;EndpointSuffix=core.windows.net;Container=feature-flags"
```

## Future Enhancements

- **S3 Support**: Add Amazon S3 storage backend
- **Google Cloud Storage**: Add GCS storage backend
- **Container Auto-creation**: Automatically create containers/buckets if they don't exist
- **Caching**: Add optional caching layer for improved performance
- **Encryption**: Support client-side encryption for sensitive flag data

## Troubleshooting

### Azure Blob Storage connection issues

1. Verify your connection string is correct and includes all required parameters (AccountName, AccountKey, Container)
2. Ensure the container exists
3. Check network connectivity to Azure
4. Review server logs for detailed error messages

## Contributing

When adding new storage backends:

1. Implement the `StorageBackend` trait
2. Add protocol detection in `create_storage_backend`
3. Update this documentation
4. Add appropriate tests
