#!/usr/bin/env bash
# Restores a backup made by backup.sh.
#
#   bash deploy/restore.sh --check <backup> [--identity <age-key-file>]
#       Changes nothing: loads the backup into a throwaway database next to the real one, prints its row counts next
#       to the live ones and drops it. Use it to test a backup (a restore drill) without touching real data.
#   bash deploy/restore.sh <backup> [--identity <age-key-file>]
#       Replaces the whole database. Destructive: shows what it is about to replace, asks to type RESTORE, and takes a
#       safety backup of the current database first.
#
# <backup> is a local braja-<time>.sql.gz, or an encrypted off-host copy braja-<time>.sql.gz.age, which needs the
# age private key file (--identity, kept off this server; RECOVERY.md). The dump is restored from a private copy (the
# decrypted file, or a copy of the local one) in a temporary file of the backup directory, removed at exit.
#
# Replace steps: check the file (gzip, trailer, checksum) -> load it into the throwaway database first (a dump that
# does not load never gets to drop the real one) -> show the target (compose project, container, volume, database,
# current rows) -> confirmation -> stop the backend -> safety backup -> DROP and CREATE the database (so tables added
# by newer migrations go too) -> load -> compare every table's rows with the throwaway load -> start the backend with
# the image tag currently deployed and wait until it is healthy. Backups and restores are serialized (lib.sh).
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

usage() { die "usage: bash deploy/restore.sh [--check] <backup.sql.gz | backup.sql.gz.age> [--identity <age-key-file>]"; }

mode=replace
backup=""
identity="${BRAJA_RESTORE_AGE_IDENTITY:-}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) mode=check ;;
    --identity) [ "$#" -ge 2 ] || usage; identity="$2"; shift ;;
    -*) usage ;;
    *) [ -z "$backup" ] || usage; backup="$1" ;;
  esac
  shift
done
[ -n "$backup" ] || usage
[ -f "$backup" ] || die "$backup not found"
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found"

BACKUP_DIR="$(backup_dir)"
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
# Held from the start: the restore check below uses the same throwaway database as backup.sh. While this script waits
# for the confirmation a scheduled backup waits too, and fails (and alerts) after BRAJA_BACKUP_LOCK_TIMEOUT_SECONDS.
take_backup_lock "$BACKUP_DIR"
decrypted=""
# The tag to start the backend with, and whether an exit must start it again: true only between stopping it and
# dropping the database (the real data is still there). Once dropped, a backend would migrate an empty database.
tag=""
restart_backend=false
on_exit() {
  local status=$?
  restore_check_cleanup
  [ -z "$decrypted" ] || rm -f "$decrypted"
  if [ "$restart_backend" = true ]; then
    log "Nothing was restored; starting the backend again ($tag)"
    BRAJA_IMAGE_TAG="$tag" compose up -d --wait --wait-timeout 300 backend \
      || log "ERROR: the backend did not become healthy; see: docker compose -p braja logs backend"
  fi
  return "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

case "$backup" in
  *.age)
    [ -n "$identity" ] || die "$backup is encrypted: pass the age private key file with --identity <file>"
    [ -f "$identity" ] || die "$identity not found"
    command -v age >/dev/null 2>&1 || die "age is not installed (sudo apt-get install age)"
    decrypted="$(mktemp "$BACKUP_DIR/restore-XXXXXX")"
    log "Decrypting $backup"
    age -d -i "$identity" -o "$decrypted" "$backup" \
      || die "$backup could not be decrypted with $identity (wrong key, or the file was altered)"
    dump="$decrypted"
    ;;
  *)
    # Checked with its checksum, then restored from a private copy: the safety backup below runs the rotation of
    # backup.sh, which deletes a braja-*.sql.gz older than the retention, and that could be this very file, after
    # which the real database would already be dropped with nothing left to load.
    check_backup_file "$backup"
    decrypted="$(mktemp "$BACKUP_DIR/restore-XXXXXX")"
    cp -- "$backup" "$decrypted" || die "could not copy $backup into $BACKUP_DIR (no space left?); nothing was changed"
    dump="$decrypted"
    ;;
esac
check_backup_file "$dump"

compose up -d --wait mysql
if [ "$mode" = check ]; then
  restore_check "$dump" report "$backup"
  log "Nothing was changed: the throwaway database was dropped. $backup can be restored."
  exit 0
fi

# Loaded first into the throwaway database, so a dump that does not load is found before anything is dropped.
restore_check "$dump" report "$backup"
expected="$RESTORE_CHECK_COUNTS"

project="$(compose config --format json 2>/dev/null | sed -n 's/^ *"name": *"\([^"]*\)".*/\1/p' | head -n 1)"
container="$(docker inspect -f '{{.Name}}' "$(compose ps -q mysql)" | sed 's#^/##')"
volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/mysql"}}{{.Name}}{{end}}{{end}}' "$container")"
database="$(compose exec -T mysql printenv MYSQL_DATABASE </dev/null)"
current="$(table_counts "$database")"
rows_of() { awk -v t="$1" '$1 == t {print $2}' <<< "$2"; }
{
  echo
  echo "ABOUT TO REPLACE every row of:"
  echo "    compose project  ${project:-?}"
  echo "    container        $container"
  echo "    volume           ${volume:-?}"
  echo "    database         $database"
  for table in companies employees jornadas mark_events deviations; do
    printf '    %-16s %s now -> %s from the backup\n' "$table" "$(rows_of "$table" "$current")" "$(rows_of "$table" "$expected")"
  done
  echo "with $backup."
  echo "Changes made after that backup are lost (a safety backup of the current state is taken first)."
  printf 'Type RESTORE to continue: '
} >&2
answer=""
read -r answer || true
[ "$answer" = "RESTORE" ] || die "not confirmed; nothing was changed"

tag="$(state_get CURRENT_TAG)"; tag="${tag:-latest}"
# Stopped before the safety backup, so no mark is accepted after it and then lost with the replaced database.
log "Stopping the backend"
restart_backend=true
compose stop backend

log "Safety backup of the current database"
safety="$(BRAJA_RESTORE_IN_PROGRESS=1 bash "$DEPLOY_DIR/backup.sh" --allow-offhost-failure </dev/null)" \
  || die "the safety backup failed; nothing was restored"
log "Safety backup: $safety"

restart_backend=false
log "Recreating the database $database"
mysql_root -e "DROP DATABASE IF EXISTS \`$database\`; CREATE DATABASE \`$database\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;" </dev/null
log "Loading $backup"
gzip -dc "$dump" | mysql_root "$database" \
  || die "loading failed; the database is incomplete. Restore the safety backup: bash deploy/restore.sh $safety"
restored="$(table_counts "$database")"
[ "$restored" = "$expected" ] \
  || die "the restored rows differ from the throwaway load; the backend stays stopped. Restore the safety backup: bash deploy/restore.sh $safety"
log "Every table has the rows of the backup ($(wc -l <<< "$restored" | tr -d ' ') tables)"

log "Starting the backend ($tag)"
BRAJA_IMAGE_TAG="$tag" compose up -d --wait --wait-timeout 300 backend \
  || die "the backend did not become healthy after the restore; see: docker compose -p braja logs backend"
log "Restore complete. Safety backup of the replaced state: $safety"
