#!/usr/bin/env bash
# MySQL backup (CLAUDE.md rule 33): consistent mysqldump (--single-transaction), gzip, timestamped, mode 600, with a
# .sha256 file next to it. Run by the cron that deploy/bootstrap-vps.sh installs, before every deploy and before every
# restore. Prints the backup path on stdout (deploy.sh and restore.sh read it); everything else goes to stderr.
#
#   bash deploy/backup.sh [--allow-offhost-failure]
#
# A backup only counts once it is proven good: a complete gzip stream, mysqldump's closing trailer, its checksum
# written, and (unless BRAJA_BACKUP_VERIFY_RESTORE=false) loaded into a throwaway database next to the real one with
# the same tables as the live database. Until then it is a .partial file that any failure removes, so a full disk or a
# dump cut halfway never leaves a file that looks like a backup. Old backups are removed only after a new one passed
# every check, and the newest ones are never removed.
#
# A failed off-host copy fails the script (the scheduled cron run must be noticed). deploy.sh and restore.sh pass
# --allow-offhost-failure: they only need the local copy, and an off-host outage must not block a rollback.
#
# Settings, optional, in deploy/.env:
#   BRAJA_BACKUP_DIR              default: ~/braja-backups (outside the repository)
#   BRAJA_BACKUP_RETENTION_DAYS   default: 14. Local backups older than this are removed, except the newest
#                                 BRAJA_BACKUP_KEEP_MIN (default 3), whatever their age.
#   BRAJA_BACKUP_VERIFY_RESTORE   default: true. false skips the throwaway-database load (only for a huge database).
#   BRAJA_BACKUP_AGE_RECIPIENTS   age public keys (age1..., separated by spaces). When set, the copy that leaves this
#                                 server is encrypted with them first and the off-host command receives the .age file:
#                                 this server can encrypt but never decrypt (the private keys live off it, RECOVERY.md).
#   BRAJA_BACKUP_OFFHOST_CMD      command that copies the new file off this server; it receives the path as $1. Without
#                                 BRAJA_BACKUP_AGE_RECIPIENTS it receives the plain dump, which holds personal data and
#                                 session tokens: the command must then encrypt it, e.g. an rclone crypt remote
#                                 (deploy/README.md section 8). With age, e.g.:  rclone copy "$1" offsite:braja-backups
#   BRAJA_BACKUP_HEARTBEAT_URL    ping URL of a heartbeat monitor (healthchecks.io, Better Stack): GET <url> when the
#                                 backup, its checks and its off-host copy succeeded, GET <url>/fail otherwise, so a
#                                 failed or silent cron is noticed. A failed ping only logs a warning.
#   BRAJA_DISK_MIN_FREE_MB        default: 3072 (what deploy.sh needs); less free disk after the backup pings <url>/fail
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
encrypted=""
healthy=true
# Any exit before the end (die, a failed command under set -e, a signal) removes the unfinished files, drops the
# throwaway database and reports the failure to the monitor. Finished backups are never touched here.
on_exit() {
  local status=$?
  [ -z "$partial" ] || rm -f "$partial" "$partial.sha256"
  [ -z "$encrypted" ] || rm -f "$encrypted" "$encrypted.partial"
  restore_check_cleanup
  if [ "$status" != 0 ]; then
    log "BACKUP FAILED (exit $status)"
    heartbeat /fail
  fi
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found"
BACKUP_DIR="$(backup_dir)"
RETENTION_DAYS="$(env_get BRAJA_BACKUP_RETENTION_DAYS)"; RETENTION_DAYS="${RETENTION_DAYS:-14}"
KEEP_MIN="$(env_get BRAJA_BACKUP_KEEP_MIN)"; KEEP_MIN="${KEEP_MIN:-3}"
VERIFY_RESTORE="$(env_get BRAJA_BACKUP_VERIFY_RESTORE)"; VERIFY_RESTORE="${VERIFY_RESTORE:-true}"
AGE_RECIPIENTS="$(env_get BRAJA_BACKUP_AGE_RECIPIENTS)"
OFFHOST_CMD="$(env_get BRAJA_BACKUP_OFFHOST_CMD)"
MIN_FREE_MB="$(env_get BRAJA_DISK_MIN_FREE_MB)"; MIN_FREE_MB="${MIN_FREE_MB:-3072}"
case "$RETENTION_DAYS" in ''|*[!0-9]*) die "BRAJA_BACKUP_RETENTION_DAYS must be a whole number of days" ;; esac
case "$KEEP_MIN" in ''|*[!0-9]*|0) die "BRAJA_BACKUP_KEEP_MIN must be a whole number, at least 1" ;; esac
case "$MIN_FREE_MB" in ''|*[!0-9]*) die "BRAJA_DISK_MIN_FREE_MB must be a whole number of MB" ;; esac
case "$VERIFY_RESTORE" in true|false) ;; *) die "BRAJA_BACKUP_VERIFY_RESTORE must be true or false" ;; esac
age_args=()
for recipient in $AGE_RECIPIENTS; do
  [[ "$recipient" =~ ^age1[0-9a-z]{58}$ ]] || die "BRAJA_BACKUP_AGE_RECIPIENTS holds '$recipient', which is not an age public key (age1...)"
  age_args+=(-r "$recipient")
done
if [ "${#age_args[@]}" -gt 0 ]; then
  command -v age >/dev/null 2>&1 || die "BRAJA_BACKUP_AGE_RECIPIENTS is set but age is not installed (sudo apt-get install age)"
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
take_backup_lock "$BACKUP_DIR"
# Leftovers of a run killed outright (power loss, kill -9) never count as backups; with the lock held, no other run is
# writing them. The plain copies restore.sh restores from (restore-*) are leftovers too, unless the restore that made
# them is the one running this. An encrypted copy is a leftover only next to the local backup it was made from: a
# braja-*.sql.gz.age without one may be an off-site copy downloaded here to restore it, and is kept.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'braja-*.partial' -o -name 'braja-*.partial.sha256' \
  -o -name 'braja-*.age.partial' \) -delete
# BRAJA_RESTORE_IN_PROGRESS=1: restore.sh runs this as its safety backup while it restores from a restore-* copy.
[ "${BRAJA_RESTORE_IN_PROGRESS:-}" = 1 ] || find "$BACKUP_DIR" -maxdepth 1 -type f -name 'restore-*' -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'braja-*.sql.gz.age' | while read -r leftover; do
  [ ! -f "${leftover%.age}" ] || rm -f "$leftover"
done

file="$BACKUP_DIR/braja-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
[ ! -e "$file" ] || die "$file already exists; run it again in a second"
partial="$file.partial"

log "Backing up the database to $file"
(
  umask 077
  compose exec -T mysql bash -c \
    'exec mysqldump --defaults-extra-file=<(printf "[client]\nuser=%s\npassword=%s\n" "$MYSQL_USER" "$MYSQL_PASSWORD") \
       --single-transaction --quick --no-tablespaces --triggers --set-gtid-purged=OFF --default-character-set=utf8mb4 \
       "$MYSQL_DATABASE"' </dev/null \
    | gzip -6 > "$partial"
) || die "the dump failed (database unreachable, or no space left in $BACKUP_DIR?); the previous backups are untouched"
check_backup_file "$partial"
# The checksum names the final file, so it can be checked after the rename.
(umask 077; cd "$BACKUP_DIR" && sha256sum "$(basename "$partial")" | sed 's/\.partial$//' > "$(basename "$partial").sha256") \
  || die "could not write the checksum (no space left in $BACKUP_DIR?)"
if [ "$VERIFY_RESTORE" = true ]; then
  restore_check "$partial" strict "$file"
else
  log "WARNING: BRAJA_BACKUP_VERIFY_RESTORE=false: this backup was not loaded into a throwaway database"
fi
mv "$partial.sha256" "$file.sha256"
mv "$partial" "$file"
partial=""
chmod 600 "$file" "$file.sha256"
log "Backup complete and checked: $(du -h "$file" | cut -f1), sha256 $(cut -c1-16 "$file.sha256")..."

# Rotation, only now that a new backup passed every check. Names sort by time; the newest KEEP_MIN always stay.
keep="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'braja-*.sql.gz' -printf '%f\n' | LC_ALL=C sort | tail -n "$KEEP_MIN")"
removed=0
while read -r old; do
  [ -n "$old" ] || continue
  if grep -qxF "$(basename "$old")" <<< "$keep"; then continue; fi
  rm -f "$old" "$old.sha256"
  removed=$((removed + 1))
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'braja-*.sql.gz' -mmin +$((RETENTION_DAYS * 24 * 60)) -print)
# A checksum file whose backup is gone (removed by hand) is noise.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'braja-*.sql.gz.sha256' | while read -r sum; do
  [ -f "${sum%.sha256}" ] || rm -f "$sum"
done
[ "$removed" = 0 ] || log "Removed $removed backup(s) older than $RETENTION_DAYS days (the newest $KEEP_MIN are always kept)"

if [ -n "$OFFHOST_CMD" ]; then
  upload="$file"
  if [ "${#age_args[@]}" -gt 0 ]; then
    encrypted="$file.age"
    (umask 077; age -e "${age_args[@]}" -o "$encrypted.partial" "$file") || die "age could not encrypt the backup (no space left?)"
    [ "$(head -c 21 "$encrypted.partial")" = "age-encryption.org/v1" ] || die "the encrypted copy has no age header"
    mv "$encrypted.partial" "$encrypted"
    upload="$encrypted"
    log "Encrypted for $((${#age_args[@]} / 2)) age recipient(s); this server cannot decrypt it"
  else
    log "Note: BRAJA_BACKUP_AGE_RECIPIENTS is not set; the off-host command receives the plain dump and must encrypt it"
  fi
  log "Copying $(basename "$upload") off this server"
  # The command's own output goes to stderr: stdout carries only the backup path that deploy.sh and restore.sh read.
  if ! sh -c "$OFFHOST_CMD" sh "$upload" >&2; then
    [ "$ALLOW_OFFHOST_FAILURE" = true ] || die "the off-host copy failed; the local backup $file is kept"
    log "WARNING: the off-host copy failed; continuing with the local backup $file only"
    healthy=false
  fi
  # The encrypted copy exists only to be sent; the local plain backup is what restore.sh uses on this server.
  [ -z "$encrypted" ] || rm -f "$encrypted"
  encrypted=""
else
  log "WARNING: BRAJA_BACKUP_OFFHOST_CMD is not set; this backup lives only on this server (rule 33 asks for an off-host copy)"
  healthy=false
fi

free_mb="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print int($4 / 1024)}')"
if [ "$free_mb" -lt "$MIN_FREE_MB" ]; then
  log "WARNING: only $free_mb MB free on disk (below $MIN_FREE_MB MB): free space before the next deploy (docker system df)"
  healthy=false
fi
if [ "$healthy" = true ]; then heartbeat ""; else heartbeat /fail; fi
echo "$file"
