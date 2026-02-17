#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/certs"
MKCERT_IMAGE="alpine/mkcert"

mkdir -p "${CERT_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to generate certificates with mkcert" >&2
  exit 1
fi

docker run --rm \
  --entrypoint sh \
  -v "${CERT_DIR}:/certs" \
  -w /certs \
  -e CAROOT=/certs \
  "${MKCERT_IMAGE}" \
  -lc '
    rm -f server.pem server-key.pem ca.pem rootCA.pem rootCA-key.pem
    mkcert -cert-file /certs/server.pem -key-file /certs/server-key.pem 127.0.0.1 localhost azurite
    cp /certs/rootCA.pem /certs/ca.pem
  '

docker run --rm \
  --entrypoint sh \
  -v "${CERT_DIR}:/certs" \
  alpine:3.21 \
  -lc "chown -R $(id -u):$(id -g) /certs && chmod 644 /certs/ca.pem /certs/server.pem /certs/rootCA.pem && chmod 600 /certs/server-key.pem /certs/rootCA-key.pem"

# Azurite expects an RSA PEM private key format.
openssl rsa -in "${CERT_DIR}/server-key.pem" -out "${CERT_DIR}/server-key.pem.rsa"
mv "${CERT_DIR}/server-key.pem.rsa" "${CERT_DIR}/server-key.pem"

TRUST_TARGET="/usr/local/share/ca-certificates/flagd-ui-azurite-ca.crt"
TRUST_UPDATED=false

if [[ "${OSTYPE:-}" == linux* ]] && command -v update-ca-certificates >/dev/null 2>&1; then
  if [[ "$(id -u)" -eq 0 ]]; then
    install -m 0644 "${CERT_DIR}/ca.pem" "${TRUST_TARGET}"
    update-ca-certificates
    TRUST_UPDATED=true
  elif command -v sudo >/dev/null 2>&1; then
    sudo install -m 0644 "${CERT_DIR}/ca.pem" "${TRUST_TARGET}"
    sudo update-ca-certificates
    TRUST_UPDATED=true
  fi
fi

printf "Created certificates using mkcert (Docker):\n"
printf "  CA cert:      %s\n" "${CERT_DIR}/ca.pem"
printf "  Server cert:  %s\n" "${CERT_DIR}/server.pem"
printf "  Server key:   %s\n\n" "${CERT_DIR}/server-key.pem"

if [[ "${TRUST_UPDATED}" == "true" ]]; then
  printf "System trust store updated automatically with: %s\n" "${TRUST_TARGET}"
else
  printf "Automatic trust update was skipped or unavailable.\n"
  printf "Add the CA to trust store manually (Ubuntu/Debian):\n"
  printf "  sudo cp %s %s\n" "${CERT_DIR}/ca.pem" "${TRUST_TARGET}"
  printf "  sudo update-ca-certificates\n"
fi
