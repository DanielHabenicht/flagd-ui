# Azure Blob Storage for flagd-ui (Docker)

This guide explains how to run `flagd-ui` in with Azure Blob Storage as storage for flag files.

## Storage URI format

`flagd-ui` uses this URI format for Azure Blob storage:

```text
azblob://<container>[/<blob>]
```

Specifying the container will allow `flagd-ui` to list all blobs in that container as flags. You can optionally specify a blob path to target a specific file.

## Configuration

```bash
docker run --rm -p 3000:3000 \
	--storage-uri "azblob://feature-flags" \
	-e AZURE_STORAGE_ACCOUNT="<your-storage-account>" \
	ghcr.io/danielhabenicht/flagd-ui:latest
```

Then add one of the authentication options below.

## Authentication options

### 1) Microsoft Entra ID (service principal / managed identity)

`flagd-ui` supports Entra ID credentials from environment:

- Service principal: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
- Managed identity (in Azure-hosted environments)

Service principal example:

```bash
docker run --rm -p 3000:3000 \
	--storage-uri "azblob://feature-flags" \
	-e AZURE_STORAGE_ACCOUNT="<your-storage-account>" \
	-e AZURE_TENANT_ID="<tenant-id>" \
	-e AZURE_CLIENT_ID="<client-id>" \
	-e AZURE_CLIENT_SECRET="<client-secret>" \
	ghcr.io/danielhabenicht/flagd-ui:latest
```

Required role:

- Assign at least `Storage Blob Data Contributor` to the identity on the target container (or a broader storage scope)

### 2) SAS token (recommended for simple container deployments)

Provide a SAS token via `AZURE_STORAGE_SAS_TOKEN`:

```bash
docker run --rm -p 3000:3000 \
	--storage-uri "azblob://feature-flags" \
	-e AZURE_STORAGE_ACCOUNT="<your-storage-account>" \
	-e AZURE_STORAGE_SAS_TOKEN="<sas-token-with-list-read-write-if-needed>" \
	ghcr.io/danielhabenicht/flagd-ui:latest
```

For read/write/delete operations, your SAS should include the required permissions.

### 3) Connection string (SAS-based only)

You can also provide:

- `AZURE_STORAGE_CONNECTION_STRING`, or
- `AZURE_STORAGEBLOB_CONNECTIONSTRING`

If using this method, use a connection string that contains a SAS (`SharedAccessSignature=...`) for auth.

## Important limitation: AccountKey auth is not supported

Account-key authentication is currently not supported by this Rust integration:

- `AZURE_STORAGE_KEY`
- connection strings using `AccountKey=...`

Reference: https://github.com/Azure/azure-sdk-for-rust/issues/2975

## Optional service URL overrides

These environment variables can be used to shape the generated Azure service URL:

- `AZURE_STORAGE_DOMAIN` (default `blob.core.windows.net`)
- `AZURE_STORAGE_PROTOCOL` (`https` default)
- `AZURE_STORAGE_IS_CDN`
- `AZURE_STORAGE_IS_LOCAL_EMULATOR`

## Docker Compose example

```yaml
services:
	flagd-ui:
		image: ghcr.io/danielhabenicht/flagd-ui:latest
		ports:
			- "3000:3000"
		environment:
			AZURE_STORAGE_ACCOUNT: <your-storage-account>

			# Choose ONE auth option:
			# 1) OR Service principal:
			# AZURE_TENANT_ID: <tenant-id>
			# AZURE_CLIENT_ID: <client-id>
			# AZURE_CLIENT_SECRET: <client-secret>

			# 2) SAS token:
			# AZURE_STORAGE_SAS_TOKEN: <sas-token>

			# Optional URL shaping:
			# AZURE_STORAGE_DOMAIN: blob.core.windows.net
			# AZURE_STORAGE_PROTOCOL: https
        commands: ["--storage-uri", "azblob://feature-flags"]
```
