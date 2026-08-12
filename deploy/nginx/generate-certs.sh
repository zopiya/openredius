#!/bin/sh
# Generate self-signed TLS cert for nginx (docs/07).
# Skipped when real certs are already mounted at /etc/nginx/certs/.
set -eu

CERT_DIR="/etc/nginx/certs"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

# Respect no-TLS override (internal-only deployments).
if [ "${OPENREDIUS_NO_TLS:-0}" = "1" ]; then
    echo "[nginx] OPENREDIUS_NO_TLS=1, skipping cert generation"
    exit 0
fi

# Real certs mounted? Skip.
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "[nginx] using mounted certs at $CERT_DIR"
    exit 0
fi

mkdir -p "$CERT_DIR"

# Generate a self-signed cert valid for 365 days.
openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -days 365 \
    -subj "/CN=OpenRedius" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "[nginx] self-signed cert generated at $CERT_DIR"
