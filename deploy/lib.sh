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

# "rank:version" of the last successful Flyway migration, or "none" before the first one.
schema_version() {
  local exists
  exists="$(mysql_app "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'flyway_schema_history'")"
  if [ "$exists" != "1" ]; then echo none; return; fi
  mysql_app "SELECT CONCAT(installed_rank, ':', COALESCE(version, '')) FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank DESC LIMIT 1"
}
