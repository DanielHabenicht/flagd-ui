# Azure Blob Storage Init Container

This directory contains an init container that automatically sets up an Azure Blob Storage container and uploads the demo feature flags file when running locally with Azurite.

## What it does

The init container:
1. Waits for the Azurite emulator to be ready
2. Creates a blob storage container named `feature-flags`
3. Uploads `flags/demo.flagd.json` to the container

## Running locally with Azure Blob Storage

To run the backend (flagd) locally with Azure Blob Storage support using Azurite:

```bash
docker compose up --build azurite azurite-init flagd-azurite
```

This command will:
- Start the Azurite emulator (local Azure Storage emulator)
- Run the init container to create the container and upload demo.flagd.json
- Start flagd configured to read from Azure Blob Storage

The flagd service will be available on:
- gRPC: `localhost:8023`
- HTTP: `localhost:8026`
- Sync: `localhost:8024`

## Connection Details

**Azure Storage Connection String:**
```
DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://azurite:10000/devstoreaccount1;
```

**Blob Storage URL for flagd:**
```
https://devstoreaccount1:Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==@azurite:10000/devstoreaccount1/feature-flags/demo.flagd.json
```

## Accessing Azurite

Azurite exposes the following ports:
- **Blob Service**: `https://localhost:10000`
- **Queue Service**: `https://localhost:10001`
- **Table Service**: `https://localhost:10002`

## Manual Upload

If you need to manually upload or update files in the blob storage:

```bash
# Install Azure CLI if not already installed
# macOS: brew install azure-cli
# Ubuntu: curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Export the connection string
export AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;"

# Upload a file
az storage blob upload \
  -f flags/demo.flagd.json \
  -c feature-flags \
  -n demo.flagd.json \
  --overwrite

# List blobs in the container
az storage blob list -c feature-flags --output table
```

## Troubleshooting

### Init container fails to connect
If the init container fails to connect to Azurite, check:
1. Azurite service is running: `docker compose ps azurite`
2. Azurite logs: `docker compose logs azurite`
3. Healthcheck status: `docker inspect <container-id>`

### Certificate errors
The Azurite emulator uses self-signed certificates. The init container and flagd services are configured to accept these certificates. If you're connecting from your host machine, you may need to:
1. Trust the CA certificate (see `/services/azurite/README.md` for details)
2. Or disable SSL verification with `AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1`

## Architecture

```
┌─────────────────┐
│  azurite        │  ← Azure Storage Emulator
│  (port 10000)   │
└────────┬────────┘
         │
         │ depends_on (healthy)
         ▼
┌─────────────────┐
│  azurite-init   │  ← Creates container & uploads demo.flagd.json
│  (init container)
└────────┬────────┘
         │
         │ depends_on (completed)
         ▼
┌─────────────────┐
│  flagd-azurite  │  ← Reads flags from Azure Blob Storage
│  (port 8023-26) │
└─────────────────┘
```
