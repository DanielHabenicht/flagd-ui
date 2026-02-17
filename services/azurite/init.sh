#!/bin/sh
export AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1
# Create container
az storage container create -n feature-flags --connection-string "DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://azurite:10000/devstoreaccount1;"

# Create/Update demo.flagd.json
az storage blob upload -f demo.flagd.json -c feature-flags -n demo.flagd.json --connection-string "DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://azurite:10000/devstoreaccount1;" --overwrite
