#!/usr/bin/env bash
# Daily MySQL backup (CLAUDE.md rule 33, RPO 24 h): consistent mysqldump (--single-transaction), gzip, timestamped,
# mode 600, 14 days kept. Prints the backup path on stdout (deploy.sh uses it); everything else goes to stderr.
#
#   bash deploy/backup.sh [--allow-offhost-failure]
#
# A failed off-host copy fails the script (the scheduled cron run must be noticed). deploy.sh and restore.sh pass
# --allow-offhost-failure: they only need the local copy, and an off-host outage must not block a rollback.
#
# Settings, optional, in deploy/.env:
#   BRAJA_BACKUP_DIR            default: ~/braja-backups (outside the repository)
#   BRAJA_BACKUP_RETENTION_DAYS default: 14
#   BRAJA_BACKUP_OFFHOST_CMD    command that copies the new file off this server; it receives the path as $1. The dump
#                               holds personal data and session tokens: the copy must be encrypted, e.g. an rclone
#                               crypt remote:  rclone copy "$1" braja-crypt:   (deploy/README.md section 8)
#   BRAJA_BACKUP_HEARTBEAT_URL  ping URL of a heartbeat monitor (healthchecks.io, Better Stack): GET <url> when the backup
#                               and its off-host copy succeeded, GET <url>/fail otherwise, so a silent cron is noticed.
#                               A failed ping only logs a warning; it never changes the result of the backup.
#   BRAJA_DISK_MIN_FREE_MB      default: 3072 (what deploy.sh needs); less free disk after the backup pings <url>/fail
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ALLOW_OFFHOST_FAILURE=false
case "${1:-}" in
  "") ;;
  --allow-offhost-failure) ALLOW_OFFHOST_FAILURE=true ;;
  *) die "unknown option: $1" ;;
esac
HEARTBEAT_URL="$(env_get BRAJA_BACKUP_HEARTBEAT_URL)"; HEARTBEAT_URL="${HEARTBEAT_URL%/}"

# Pings the heartbeat monitor: $1 is "" for success or "/fail". Never fails the script.
heartbeat() {
  [ -n "$HEARTBEAT_URL" ] || return 0
  # The shell discards the body (stdout carries only the backup path); no -o /dev/null, which Git Bash's MSYS_NO_PATHCONV
  # would hand to a Windows curl verbatim.
  curl -fsS --max-time 10 --retry 2 "$HEARTBEAT_URL$1" >/dev/null 2>&1 \
    || log "WARNING: could not reach the backup heartbeat URL; the backup result is not affected"
}

partial=""
healthy=true
# Any exit before the end (die, a failed command under set -e) reports the failure to the monitor.
on_exit() {
  local status=$?
  [ -z "$partial" ] || rm -f "$partial"
  if [ "$status" != 0 ]; then heartbeat /fail; fi
}
trap on_exit EXIT

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found"
BACKUP_DIR="$(env_get BRAJA_BACKUP_DIR)"; BACKUP_DIR="${BACKUP_DIR:-$HOME/braja-backups}"
RETENTION_DAYS="$(env_get BRAJA_BACKUP_RETENTION_DAYS)"; RETENTION_DAYS="${RETENTION_DAYS:-14}"
OFFHOST_CMD="$(env_get BRAJA_BACKUP_OFFHOST_CMD)"
MIN_FREE_MB="$(env_get BRAJA_DISK_MIN_FREE_MB)"; MIN_FREE_MB="${MIN_FREE_MB:-3072}"
case "$RETENTION_DAYS" in ''|*[!0-9]*) die "BRAJA_BACKUP_RETENTION_DAYS must be a whole number of days" ;; esac
case "$MIN_FREE_MB" in ''|*[!0-9]*) die "BRAJA_DISK_MIN_FREE_MB must be a whole number of MB" ;; esac

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
file="$BACKUP_DIR/braja-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
partial="$file.partial"

log "Backing up the database to $file"
(
  umask 077
  compose exec -T mysql bash -c \
    'exec mysqldump --defaults-extra-file=<(printf "[client]\nuser=%s\npassword=%s\n" "$MYSQL_USER" "$MYSQL_PASSWORD") \
       --single-transaction --quick --no-tablespaces --triggers --set-gtid-purged=OFF --default-character-set=utf8mb4 \
       "$MYSQL_DATABASE"' \
    | gzip -6 > "$partial"
)
gzip -t "$partial" || die "the backup is not a valid gzip file"
gzip -dc "$partial" | tail -n 1 | grep -q '^-- Dump completed' || die "the dump is incomplete (no 'Dump completed' trailer)"
mv "$partial" "$file"
chmod 600 "$file"
log "Backup complete: $(du -h "$file" | cut -f1)"

removed="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'braja-*.sql.gz' -mmin +$((RETENTION_DAYS * 24 * 60)) -print -delete | wc -l | tr -d ' ')"
[ "$removed" = 0 ] || log "Removed $removed backup(s) older than $RETENTION_DAYS days"

if [ -n "$OFFHOST_CMD" ]; then
  log "Copying the backup off this server"
  # The command's own output goes to stderr: stdout carries only the backup path that deploy.sh and restore.sh read.
  if ! sh -c "$OFFHOST_CMD" sh "$file" >&2; then
    [ "$ALLOW_OFFHOST_FAILURE" = true ] || die "the off-host copy failed; the local backup $file is kept"
    log "WARNING: the off-host copy failed; continuing with the local backup $file only"
    healthy=false
  fi
else
  log "WARNING: BRAJA_BACKUP_OFFHOST_CMD is not set; this backup lives only on this server (rule 33 asks for an off-host copy)"
fi

free_mb="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print int($4 / 1024)}')"
if [ "$free_mb" -lt "$MIN_FREE_MB" ]; then
  log "WARNING: only $free_mb MB free on disk (below $MIN_FREE_MB MB): free space before the next deploy (docker system df)"
  healthy=false
fi
if [ "$healthy" = true ]; then heartbeat ""; else heartbeat /fail; fi
echo "$file"
