# Local Azure Storage Emulator

Supplementary Service to be independent of Azure Storage - to test and break things.

## Setup

The local instance brings its own certificates which need to be trusted.

1. Trust the certificates:

   ```bash
   sudo cp cacert.pem /usr/local/share/ca-certificates/testca.crt
   sudo update-ca-certificates
   ```

2. Start the `docker-compose up -d` in the root of the project.

3. If needed update the `/deployment/dev/configuration.json` and `models-base.json` (they are automatically updated with an init container):

```bash
# Create container
AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1 az storage container create -n configuration --connection-string "DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;"

# Create/Update models-base.json
AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1 az storage blob upload -f models-base.json -c configuration -n models-base.json --connection-string "DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;" --overwrite

# Create/Update configuration.json
AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1 az storage blob upload -f configuration.json -c configuration -n configuration.json --connection-string "DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;" --overwrite
```

### Generate new Certificates

This is how the certificates where generated in the first place (if they ever need to be renewed):

```bash
docker run -v ./:/tmp/ --rm -it smallstep/step-ca step certificate create "Smallstep Root CA" "/tmp/cacert.pem" "/tmp/cakey.pem" \
    --no-password --insecure \
    --profile root-ca \
    --not-before "2021-01-01T00:00:00+00:00" \
    --not-after "2031-01-01T00:00:00+00:00" \
    --san "127.0.0.1" \
    --san "localhost" \
    --san "docker" \
    --san "azurite" \
    --kty RSA --size 2048


docker run -v ./cacert.pem:/home/step/cacert.pem -v ./cakey.pem:/home/step/cakey.pem -v ./:/tmp/ --rm -it smallstep/step-ca step certificate create "Smallstep Leaf" "/tmp/127.0.0.1.pem" "/tmp/127.0.0.1-key.pem" \
    --no-password --insecure \
    --profile leaf \
    --ca "cacert.pem" \
    --ca-key "cakey.pem" \
    --not-before "2021-01-01T00:00:00+00:00" \
    --not-after "2031-01-01T00:00:00+00:00" \
    --san "127.0.0.1" \
    --san "localhost" \
    --san "docker" \
    --san "azurite" \
    --kty RSA --size 2048
```
