#!/bin/bash
# Generate dev RADIUS certificates (docs/06「EAP 与证书(dev)」).
# Self-signed CA + server cert (CN=OpenRedius-Dev, SAN localhost/127.0.0.1).
# Outputs ca.pem / server.pem / server.key next to this script; compose mounts
# the directory at /etc/raddb/certs. Dev only — never reuse in prod.
set -euo pipefail

cd "$(dirname "$0")"

DAYS_CA=3650
DAYS_SERVER=825

if [ -f ca.pem ] && [ -f server.pem ] && [ -f server.key ]; then
    echo "certs already exist; remove ca.pem/server.pem/server.key to regenerate"
    exit 0
fi

# CA
openssl req -x509 -newkey rsa:2048 -days "$DAYS_CA" -nodes \
    -keyout ca.key -out ca.pem \
    -subj "/C=CN/O=OpenRedius/CN=OpenRedius-Dev-CA"

# Server key + CSR
openssl req -newkey rsa:2048 -nodes \
    -keyout server.key.plain -out server.csr \
    -subj "/C=CN/O=OpenRedius/CN=OpenRedius-Dev"

# Sign with SAN for local access
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial \
    -days "$DAYS_SERVER" -out server.crt \
    -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth")

# Upstream eap tls-config expects server.pem = cert + key encrypted with the
# dev password "whatever" (mods-available/eap). Encrypted key kept separately
# for inspection; server.pem is what FreeRADIUS reads.
openssl rsa -in server.key.plain -aes256 -passout pass:whatever -out server.key
cat server.crt server.key > server.pem

rm -f server.csr server.crt server.key.plain
chmod 600 server.key ca.key 2>/dev/null || true

echo "generated: ca.pem server.pem(+server.key) (validity: CA ${DAYS_CA}d, server ${DAYS_SERVER}d)"
