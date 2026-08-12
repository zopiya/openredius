#!/bin/bash
# restore.sh — OpenRedius PostgreSQL restore (docs/07)
#
# Restores from a pg_dump -Fc backup (compressed or not).
# Stops backend + freeradius first, restores, then restarts.
#
# Usage:
#   ./deploy/scripts/restore.sh ./backups/openredius-20260812-030000.dump.gz
#
# In compose: the script assumes docker compose or direct DB access.
# Pass RESTORE_METHOD=compose to run via docker compose exec.

set -euo pipefail

DUMP="${1:?Usage: restore.sh <dump-file>}"
RESTORE_METHOD="${RESTORE_METHOD:-direct}"
DB_NAME="${DB_NAME:-openredius}"
DB_USER="${DB_USER:-postgres}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.yml}"

if [ ! -f "$DUMP" ]; then
    echo "ERROR: dump file not found: $DUMP"
    exit 1
fi

echo "[restore] restoring ${DB_NAME} from ${DUMP} ..."
echo "[restore] WARNING: this will overwrite the current database!"

# Confirm unless in batch mode.
if [ "${FORCE:-0}" != "1" ]; then
    read -rp "Type 'yes' to continue: " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "[restore] aborted."
        exit 0
    fi
fi

if [ "$RESTORE_METHOD" = "compose" ]; then
    echo "[restore] stopping backend + freeradius ..."
    docker compose -f "$COMPOSE_FILE" stop backend freeradius

    echo "[restore] running pg_restore via compose ..."
    if [[ "$DUMP" == *.gz ]]; then
        gunzip -c "$DUMP" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
            pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-acl
    else
        docker compose -f "$COMPOSE_FILE" exec -T postgres \
            pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-acl < "$DUMP"
    fi

    echo "[restore] restarting services ..."
    docker compose -f "$COMPOSE_FILE" up -d backend freeradius
else
    # Direct connection (outside compose).
    echo "[restore] running pg_restore (direct) ..."
    if [[ "$DUMP" == *.gz ]]; then
        gunzip -c "$DUMP" | pg_restore \
            -h "${DB_HOST:-localhost}" \
            -p "${DB_PORT:-5432}" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            --clean --if-exists --no-owner --no-acl
    else
        pg_restore \
            -h "${DB_HOST:-localhost}" \
            -p "${DB_PORT:-5432}" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            --clean --if-exists --no-owner --no-acl < "$DUMP"
    fi
fi

echo "[restore] done — ${DUMP} restored to ${DB_NAME}"
