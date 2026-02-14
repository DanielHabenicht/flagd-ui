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
# Using Azure Blob Storage
export AZURE_STORAGE_ACCOUNT_KEY="your-account-key-here"
cargo run -- --storage-uri https://myaccount.blob.core.windows.net/feature-flags

# Or via environment variable
export STORAGE_URI=https://myaccount.blob.core.windows.net/feature-flags
export AZURE_STORAGE_ACCOUNT_KEY="your-account-key-here"
cargo run
```

### Azurite (Local Development)

For local development and testing with Azure Blob Storage, you can use [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite), the Azure Storage emulator.

```bash
# Start Azurite using Docker Compose
docker compose up -d azurite

# Use Azurite endpoint (uses well-known devstoreaccount1 credentials automatically)
cargo run -- --storage-uri http://127.0.0.1:10000/devstoreaccount1/feature-flags
```

**Note**: The current Azure SDK implementation (azure_storage_blobs v0.20) has compatibility issues with Azurite. This is a known limitation that requires further investigation. Consider using the Azure Storage SDK's connection string API or upgrading to a newer version of the SDK for better Azurite support.

## CLI Arguments

```
--storage-uri <STORAGE_URI>
    Storage URI for feature flags
    
    Supported formats:
    - Local filesystem: file:///path/to/flags or /path/to/flags or ./flags
    - Azure Blob Storage: https://<account>.blob.core.windows.net/<container>
    - Azurite (local): http://127.0.0.1:10000/devstoreaccount1/<container>
    
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
- `AZURE_STORAGE_ACCOUNT_KEY` or `AZURE_STORAGE_KEY`: Azure Storage account key (required for Azure Blob Storage)

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

The `create_storage_backend` function automatically selects the appropriate backend based on the URI protocol:

- `https://` or `http://` → Azure Blob Storage
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
export AZURE_STORAGE_ACCOUNT_KEY="your-key"
cargo run -- --storage-uri https://myaccount.blob.core.windows.net/feature-flags
```

## Future Enhancements

- **S3 Support**: Add Amazon S3 storage backend
- **Google Cloud Storage**: Add GCS storage backend
- **Connection String Support**: Support Azure Storage connection strings for easier configuration
- **Container Auto-creation**: Automatically create containers/buckets if they don't exist
- **Azurite Compatibility**: Improve Azure SDK configuration for better Azurite support
- **Caching**: Add optional caching layer for improved performance
- **Encryption**: Support client-side encryption for sensitive flag data

## Troubleshooting

### Azure Blob Storage connection issues

1. Verify your account key is correct
2. Ensure the container exists
3. Check network connectivity to Azure
4. Review server logs for detailed error messages

### Azurite compatibility

The current implementation may have issues with Azurite due to SDK limitations. For production testing with Azure Blob Storage, consider:

1. Using a real Azure Storage account
2. Investigating newer versions of azure_storage_blobs SDK
3. Using connection string-based authentication

## Contributing

When adding new storage backends:

1. Implement the `StorageBackend` trait
2. Add protocol detection in `create_storage_backend`
3. Update this documentation
4. Add appropriate tests
