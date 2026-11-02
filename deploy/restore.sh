#!/usr/bin/env bash
# Replaces the whole database with a backup made by backup.sh. Destructive: asks for confirmation, and takes a
# safety backup of the current database first.
#
#   bash deploy/restore.sh ~/braja-backups/braja-20261103T061500Z.sql.gz
#
# Steps: safety backup, stop the backend, DROP and CREATE the database (so tables added by newer migrations go too),
# load the dump, start the backend with the image tag currently deployed and wait until it is healthy.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

backup="${1:-}"
[ -n "$backup" ] || die "usage: bash deploy/restore.sh <backup.sql.gz>"
[ -f "$backup" ] || die "$backup not found"
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found"
gzip -t "$backup" || die "$backup is not a valid gzip file"
gzip -dc "$backup" | tail -n 1 | grep -q '^-- Dump completed' || die "$backup is incomplete (no 'Dump completed' trailer)"

echo "This REPLACES every row of the database with $backup." >&2
echo "Changes made after that backup are lost (a safety backup of the current state is taken first)." >&2
printf 'Type RESTORE to continue: ' >&2
read -r answer || true
[ "$answer" = "RESTORE" ] || die "not confirmed; nothing was changed"

compose up -d --wait mysql
log "Safety backup of the current database"
safety="$(bash "$DEPLOY_DIR/backup.sh" --allow-offhost-failure)"
log "Safety backup: $safety"

tag="$(state_get CURRENT_TAG)"; tag="${tag:-latest}"
log "Stopping the backend"
compose stop backend

log "Recreating the database"
compose exec -T mysql bash -c \
  'mysql --defaults-extra-file=<(printf "[client]\nuser=root\npassword=%s\n" "$MYSQL_ROOT_PASSWORD") -e \
     "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"'
log "Loading $backup"
gzip -dc "$backup" | compose exec -T mysql bash -c \
  'mysql --defaults-extra-file=<(printf "[client]\nuser=root\npassword=%s\n" "$MYSQL_ROOT_PASSWORD") "$MYSQL_DATABASE"'

log "Starting the backend ($tag)"
BRAJA_IMAGE_TAG="$tag" compose up -d --wait --wait-timeout 300 backend \
  || die "the backend did not become healthy after the restore; see: docker compose -p braja logs backend"
log "Restore complete. Safety backup of the replaced state: $safety"
