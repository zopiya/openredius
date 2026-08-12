#!/bin/bash
# FreeRADIUS config smoke test (roadmap M3: radiusd -XC 冒烟).
# Verifies the built image's raddb parses after entrypoint envsubst+patching.
# Usage: bash deploy/scripts/smoke_freeradius.sh
set -euo pipefail

COMPOSE_FILE="deploy/docker-compose.dev.yml"

if ! docker compose -f "$COMPOSE_FILE" image freeradius >/dev/null 2>&1; then
    echo "building freeradius image first..."
    docker compose -f "$COMPOSE_FILE" build freeradius
fi

echo "==> radiusd -XC (config check + exit)"
docker compose -f "$COMPOSE_FILE" run --rm --entrypoint /entrypoint.sh freeradius radiusd -CX
echo "==> smoke OK"
