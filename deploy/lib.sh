# Shared helpers for the deploy scripts. Sourced, never run.
# BRAJA_ENV_FILE overrides deploy/.env (local verification uses a scratch copy); the deploy state file lives next to it.

# pwd -W (Git Bash only) gives a C:/ path the Windows docker CLI understands; Linux bash rejects -W and falls back.
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && { pwd -W 2>/dev/null || pwd; })"
REPO_DIR="$(dirname "$DEPLOY_DIR")"
ENV_FILE="${BRAJA_ENV_FILE:-$DEPLOY_DIR/.env}"
STATE_FILE="${BRAJA_STATE_FILE:-$(dirname "$ENV_FILE")/.deploy-state}"
export BRAJA_ENV_FILE="$ENV_FILE"
# Git Bash on Windows rewrites arguments that look like paths; the scripts pass SQL and container paths verbatim.
export MSYS_NO_PATHCONV=1

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

compose() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/docker-compose.yml" --env-file "$ENV_FILE" "$@"
}

# Reads KEY from a KEY='value' file without sourcing it (values are data, never shell code).
file_get() {
  local file="$1" key="$2" line
  [ -f "$file" ] || return 0
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line#\'}"; line="${line%\'}"
  line="${line#\"}"; line="${line%\"}"
  printf '%s' "$line"
}

# Replaces or appends KEY='value' in place, keeping the file's inode and mode 600.
file_set() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp)"
  if [ -f "$file" ]; then grep -vE "^${key}=" "$file" > "$tmp" || true; fi
  printf "%s='%s'\n" "$key" "$value" >> "$tmp"
  if [ -f "$file" ]; then cat "$tmp" > "$file"; else (umask 077; cat "$tmp" > "$file"); fi
  rm -f "$tmp"
}

env_get() { file_get "$ENV_FILE" "$1"; }
env_set() { file_set "$ENV_FILE" "$1" "$2"; }
state_get() { file_get "$STATE_FILE" "$1"; }
state_set() { file_set "$STATE_FILE" "$1" "$2"; }

# Runs one SQL statement as the application user inside the mysql container; the password never leaves the container.
mysql_app() {
  compose exec -T mysql bash -c \
    'mysql --defaults-extra-file=<(printf "[client]\nuser=%s\npassword=%s\n" "$MYSQL_USER" "$MYSQL_PASSWORD") -N -B "$MYSQL_DATABASE" -e "$1"' \
    sh "$1"
}

# Runs the mysql client as root inside the mysql container; stdin is passed through (a dump to load), the rest of the
# arguments go to mysql. The root password never leaves the container. Callers that load nothing redirect </dev/null.
mysql_root() {
  compose exec -T mysql bash -c \
    'exec mysql --defaults-extra-file=<(printf "[client]\nuser=root\npassword=%s\n" "$MYSQL_ROOT_PASSWORD") "$@"' \
    sh "$@"
}

# Directory of the local backups: BRAJA_BACKUP_DIR in deploy/.env, else ~/braja-backups (outside the repository).
backup_dir() {
  local dir
  dir="$(env_get BRAJA_BACKUP_DIR)"
  printf '%s' "${dir:-$HOME/braja-backups}"
}

# One backup or restore at a time: a dump taken while restore.sh reloads the database would end with a valid trailer
# and look complete. Holds an flock on <backup dir>/.backup.lock (fd 9) until the script exits, and marks it held for
# the child scripts it runs (restore.sh's safety backup). Without flock (Git Bash on Windows) it only warns.
take_backup_lock() {
  local dir="$1"
  [ "${BRAJA_BACKUP_LOCK_HELD:-}" != 1 ] || return 0
  if ! command -v flock >/dev/null 2>&1; then
    log "WARNING: flock is not installed; backups and restores are not serialized on this machine"
    return 0
  fi
  exec 9>"$dir/.backup.lock"
  flock -w "${BRAJA_BACKUP_LOCK_TIMEOUT_SECONDS:-900}" 9 \
    || die "another backup or restore is still running (lock $dir/.backup.lock); try again when it ends"
  export BRAJA_BACKUP_LOCK_HELD=1
}

# Checks a local backup made by backup.sh: a complete gzip stream, mysqldump's closing trailer, and the same SHA-256 as
# its .sha256 file when there is one (backups made before checksums existed have none). Dies with the reason.
check_backup_file() {
  local file="$1" dir name
  gzip -t "$file" 2>/dev/null || die "$file is not a valid gzip file (truncated or corrupted)"
  gzip -dc "$file" | tail -n 1 | grep -q '^-- Dump completed' || die "$file is incomplete (no 'Dump completed' trailer)"
  if [ -f "$file.sha256" ]; then
    dir="$(dirname "$file")"; name="$(basename "$file")"
    (cd "$dir" && sha256sum -c --status "$name.sha256") || die "$file does not match its checksum $name.sha256"
  fi
}

# Throwaway database the restore check loads a backup into, next to the real one. Never the real database.
RESTORE_CHECK_DB=braja_restore_check
RESTORE_CHECK_ACTIVE=false
# Filled by restore_check: "table rows" lines of the backup as loaded, sorted by table name.
RESTORE_CHECK_COUNTS=""

# Exact row count of every base table of database $1, as "table rows" lines sorted by table name.
table_counts() {
  local db="$1" tables table sql=""
  tables="$(mysql_root -N -B -e "SELECT table_name FROM information_schema.tables WHERE table_schema = '$db' AND table_type = 'BASE TABLE' ORDER BY table_name" </dev/null)"
  for table in $tables; do
    [[ "$table" =~ ^[A-Za-z0-9_]+$ ]] || die "unexpected table name in $db: $table"
    [ -z "$sql" ] || sql="$sql UNION ALL "
    sql="${sql}SELECT '$table', COUNT(*) FROM \`$db\`.\`$table\`"
  done
  [ -n "$sql" ] || return 0
  mysql_root -N -B -e "$sql" </dev/null | tr '\t' ' ' | LC_ALL=C sort
}

# Drops the throwaway database if a restore check left it behind. Safe to call from an EXIT trap.
restore_check_cleanup() {
  [ "$RESTORE_CHECK_ACTIVE" = true ] || return 0
  mysql_root -e "DROP DATABASE IF EXISTS \`$RESTORE_CHECK_DB\`" </dev/null >/dev/null 2>&1 \
    || log "WARNING: could not drop the throwaway database $RESTORE_CHECK_DB; drop it by hand"
  RESTORE_CHECK_ACTIVE=false
}

# Proves a backup can be restored without touching the real database: loads file $1 into $RESTORE_CHECK_DB, counts every
# table exactly, prints the counts next to the live ones and drops it; $3 names the backup in the log. Dies if the load
# fails, or if it restores no table while the live database has some (both are empty before the first migration).
# $2 = strict: also dies if the backup and the live database do not have the same tables (backup.sh, right after the
# dump; an older backup checked with restore.sh --check may predate a migration, so there it is only reported).
restore_check() {
  local file="$1" mode="${2:-report}" label="${3:-$1}" live_db live table restored_rows live_rows marker total=0
  live_db="$(compose exec -T mysql printenv MYSQL_DATABASE </dev/null)"
  [ -n "$live_db" ] || die "cannot read MYSQL_DATABASE from the mysql container"
  [ "$live_db" != "$RESTORE_CHECK_DB" ] || die "the real database is called $RESTORE_CHECK_DB; refusing to use it as a throwaway"
  RESTORE_CHECK_ACTIVE=true
  mysql_root -e "DROP DATABASE IF EXISTS \`$RESTORE_CHECK_DB\`; CREATE DATABASE \`$RESTORE_CHECK_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci" </dev/null \
    || die "could not create the throwaway database $RESTORE_CHECK_DB"
  gzip -dc "$file" | mysql_root "$RESTORE_CHECK_DB" \
    || { restore_check_cleanup; die "$file does not load into a throwaway database: it cannot be restored"; }
  RESTORE_CHECK_COUNTS="$(table_counts "$RESTORE_CHECK_DB")"
  live="$(table_counts "$live_db")"
  restore_check_cleanup
  if [ -z "$RESTORE_CHECK_COUNTS" ]; then
    # Before the first deploy the database has no table yet, and its backup is empty too: nothing to compare.
    [ -z "$live" ] || die "$file restored no table at all, but the live database has tables"
    log "Restore check: the backup and the live database are both empty (no migration has run yet)"
    return 0
  fi
  log "Restore check of $(basename "$label") in a throwaway database (live database: $live_db):"
  printf '    %-40s %10s %10s\n' table backup live >&2
  while read -r table restored_rows; do
    live_rows="$(awk -v t="$table" '$1 == t {print $2}' <<< "$live")"
    marker=""; [ "$restored_rows" = "$live_rows" ] || marker="  <- differs"
    printf '    %-40s %10s %10s%s\n' "$table" "$restored_rows" "${live_rows:--}" "$marker" >&2
    total=$((total + restored_rows))
  done <<< "$RESTORE_CHECK_COUNTS"
  while read -r table live_rows; do
    [ -n "$table" ] || continue
    awk -v t="$table" '$1 == t {found = 1} END {exit !found}' <<< "$RESTORE_CHECK_COUNTS" \
      || printf '    %-40s %10s %10s  <- not in the backup\n' "$table" - "$live_rows" >&2
  done <<< "$live"
  if [ "$mode" = strict ] && [ "$(cut -d' ' -f1 <<< "$RESTORE_CHECK_COUNTS")" != "$(cut -d' ' -f1 <<< "$live")" ]; then
    die "the backup does not have the same tables as the live database"
  fi
  log "Restore check passed: $(wc -l <<< "$RESTORE_CHECK_COUNTS" | tr -d ' ') tables and $total rows loaded, then dropped"
}

# "rank:version" of the last successful Flyway migration, or "none" before the first one.
schema_version() {
  local exists
  exists="$(mysql_app "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'flyway_schema_history'")"
  if [ "$exists" != "1" ]; then echo none; return; fi
  mysql_app "SELECT CONCAT(installed_rank, ':', COALESCE(version, '')) FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank DESC LIMIT 1"
}
