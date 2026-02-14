#!/bin/sh
set -e

# Azure Storage connection string for local Azurite emulator
CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://azurite:10000/devstoreaccount1;"

echo "Waiting for Azurite to be ready..."
# Wait for Azurite to be available (retry for up to 60 seconds)
for i in $(seq 1 30); do
  if az storage container list --connection-string "$CONNECTION_STRING" > /dev/null 2>&1; then
    echo "Azurite is ready!"
    break
  fi
  echo "Waiting for Azurite... attempt $i/30"
  sleep 2
done

echo "Creating blob storage container 'feature-flags'..."
az storage container create \
  -n feature-flags \
  --connection-string "$CONNECTION_STRING" \
  --output table

echo "Uploading demo.flagd.json to blob storage..."
az storage blob upload \
  -f /tmp/demo.flagd.json \
  -c feature-flags \
  -n demo.flagd.json \
  --connection-string "$CONNECTION_STRING" \
  --overwrite \
  --output table

echo "Init container completed successfully!"
echo "File uploaded to: https://azurite:10000/devstoreaccount1/feature-flags/demo.flagd.json"
