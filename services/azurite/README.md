# Local Azure Storage Emulator

Supplementary Service to be independent of Azure Storage - to test and break things.

## Setup

The local instance brings its own certificates which need to be trusted.

1. Generate local certificates (uses `mkcert` via Docker):

   ```bash
   ./services/azurite/generate-certs.sh
   ```

2. Trust the generated CA certificate (should be done automatically):

   ```bash
   sudo cp services/azurite/certs/ca.pem /usr/local/share/ca-certificates/flagd-ui-azurite-ca.crt
   sudo update-ca-certificates
   ```

3. Start `docker compose up -d` in the project root.

```bash
# Create container
AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1 az storage container create -n configuration --connection-string "DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;"

# Create/Update models-base.json
AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1 az storage blob upload -f models-base.json -c configuration -n models-base.json --connection-string "DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;" --overwrite

# Create/Update configuration.json
AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1 az storage blob upload -f configuration.json -c configuration -n configuration.json --connection-string "DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;" --overwrite
```
