# Azure Blob Storage Init Container

This directory contains an init container that automatically sets up an Azure Blob Storage container and uploads the demo feature flags file when running locally with Azurite.

## What it does

The init container:
1. Waits for the Azurite emulator to be ready
2. Creates a blob storage container named `feature-flags`
3. Uploads `flags/demo.flagd.json` to the container

## Running locally with Azure Blob Storage

To run the backend (flagd) locally with Azure Blob Storage support using Azurite:

### Option 1: Run init container with file-based flagd (recommended for local development)

```bash
docker compose up --build azurite azurite-init flagd
```

This will:
- Start the Azurite emulator (local Azure Storage emulator)
- Run the init container to create the container and upload demo.flagd.json to Azure Blob Storage
- Start flagd configured to read from the local file system (for simplicity)

The file will be uploaded to Azure Blob Storage and you can verify it using Azure Storage Explorer or the Azure CLI.

The flagd service will be available on:
- gRPC: `localhost:8013`
- HTTP: `localhost:8016`
- Sync: `localhost:8014`

### Option 2: Full stack with UI

```bash
docker compose up --build
```

This starts all services including the flagd-ui web interface.

## Connection Details

**Azure Storage Connection String:**
```
DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://azurite:10000/devstoreaccount1;
```

Note: Replace `azurite` with `127.0.0.1` or `localhost` when connecting from your host machine.

**Blob Storage Container:** `feature-flags`  
**Blob Name:** `demo.flagd.json`

## Accessing Azurite

Azurite exposes the following ports:
- **Blob Service**: `https://localhost:10000`
- **Queue Service**: `https://localhost:10001`
- **Table Service**: `https://localhost:10002`

## Verifying the Upload

After running the init container, you can verify the file was uploaded:

```bash
# Install Azure CLI if not already installed
# macOS: brew install azure-cli
# Ubuntu: curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Export the connection string (from your host machine)
export AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;"

# List containers
az storage container list --output table

# List blobs in the feature-flags container
az storage blob list -c feature-flags --output table

# Download the file to verify
az storage blob download \
  -c feature-flags \
  -n demo.flagd.json \
  -f /tmp/downloaded-demo.flagd.json

cat /tmp/downloaded-demo.flagd.json
```

## Manual Upload

If you need to manually upload or update files in the blob storage:

```bash
# Upload a file
az storage blob upload \
  -f flags/demo.flagd.json \
  -c feature-flags \
  -n demo.flagd.json \
  --overwrite
```

## Troubleshooting

### Init container fails to connect
If the init container fails to connect to Azurite, check:
1. Azurite service is running: `docker compose ps azurite`
2. Azurite logs: `docker compose logs azurite`
3. Healthcheck status: `docker compose ps` (should show "healthy")

### Certificate errors
The Azurite emulator uses self-signed certificates. The init container is configured to accept these certificates via `AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1`. If you're connecting from your host machine:

1. You can use the same environment variable:
   ```bash
   export AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1
   ```

2. Or trust the CA certificate (see `/services/azurite/README.md` for details on certificate generation)

### Container already exists error
If you see "The specified container already exists", the init container has already run successfully. You can either:
- Ignore the error (it's harmless)
- Delete the volume and restart: `docker compose down -v && docker compose up --build`

## Architecture

```
┌─────────────────┐
│  azurite        │  ← Azure Storage Emulator with blob/queue/table services
│  (port 10000)   │
└────────┬────────┘
         │
         │ depends_on (healthy)
         ▼
┌─────────────────┐
│  azurite-init   │  ← Init container: Creates container & uploads demo.flagd.json
│  (runs once)    │
└────────┬────────┘
         │
         │ depends_on (completed)
         ▼
┌─────────────────┐
│  flagd          │  ← Reads flags from local file system
│  (port 8013-16) │
└─────────────────┘
```

## Notes

- The init container runs once and then exits. It uses `restart: "no"` to prevent unnecessary restarts.
- Azurite data is stored in a Docker volume (`azurite-data`) and persists between container restarts.
- To reset everything, use: `docker compose down -v`

