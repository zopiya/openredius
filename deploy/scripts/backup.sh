#!/bin/bash
# backup.sh — OpenRedius PostgreSQL backup (docs/07)
#
# Performs pg_dump -Fc of the openredius database (public + radius schemas),
# compresses with gzip, and retains the last RETENTION copies.
#
# Usage:
#   BACKUP_DIR=/var/backups/openredius RETENTION=14 ./deploy/scripts/backup.sh
#
# Prerequisites: pg_dump in PATH, PGPASSWORD set or .pgpass configured.
# In compose: docker compose exec postgres pg_dump -U postgres openredius
#
# Cron (daily): 0 3 * * * /opt/openredius/deploy/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${RETENTION:-14}"
DB_NAME="${DB_NAME:-openredius}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
PGPASSWORD="${PGPASSWORD:-}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
FILENAME="${DB_NAME}-${TIMESTAMP}.dump.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "$BACKUP_DIR"

echo "[backup] dumping ${DB_NAME} to ${FILEPATH} ..."

PGPASSWORD="${PGPASSWORD}" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -Fc \
    --no-owner \
    --no-acl \
    | gzip > "$FILEPATH"

SIZE="$(du -h "$FILEPATH" | cut -f1)"
echo "[backup] done — ${FILENAME} (${SIZE})"

# Rotate: keep only the last RETENTION files.
pushd "$BACKUP_DIR" >/dev/null
KEEP=$((RETENTION))
TOTAL=$(ls -1 *.dump.gz 2>/dev/null | wc -l)
if [ "$TOTAL" -gt "$KEEP" ]; then
    DELETE=$((TOTAL - KEEP))
    echo "[backup] rotating — removing ${DELETE} old backup(s)"
    ls -1t *.dump.gz | tail -n "$DELETE" | xargs rm -f
fi
popd >/dev/null

echo "[backup] retention: keeping last ${RETENTION} copies (${KEEP} now on disk)"
