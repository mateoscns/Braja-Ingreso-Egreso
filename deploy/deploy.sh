#!/usr/bin/env bash
# Deploys the checked-out commit on this server (CLAUDE.md rule 32). Run it on the VPS from the repository checkout:
#
#   bash deploy/deploy.sh             build and deploy HEAD
#   bash deploy/deploy.sh --force     the same, past the two release guards below (says which ones it skipped)
#   bash deploy/deploy.sh --rollback  go back to the previously deployed images (no build, no guards: it is the fix)
#
# Order: preflight -> release guards -> build images tagged with the git sha -> shop-hours guard again (the build
# takes minutes) -> MySQL up -> backup (Flyway migrates when the backend starts, so the backup always precedes the
# migration) -> start -> wait for GET /api/v1/health through Caddy -> prune the build cache and old images, keeping
# the previous image for a rollback; on failure, roll back to the previous images and say whether the database must
# be restored. Re-running it for the same commit is safe: the build is cached and the containers stay as they are.
#
# Release guards (rule 31), each skipped by --force or BRAJA_DEPLOY_FORCE=true:
#   - HEAD must be origin/main after a git fetch. Whether CI is green is not checked here (no GitHub API): it is a
#     step of docs/CHECKLIST_RELEASE.md.
#   - Not during shop hours: swapping the backend cuts the API for 30 to 60 s. Settings, as environment variables or
#     in deploy/.env:
#       BRAJA_DEPLOY_BLOCKED_DAYS   ISO weekdays, 1 = Monday, a range or a list   default: 1-6 (Monday to Saturday)
#       BRAJA_DEPLOY_BLOCKED_FROM   HH:MM, inclusive                              default: 08:00
#       BRAJA_DEPLOY_BLOCKED_UNTIL  HH:MM, exclusive                              default: 19:00
#       BRAJA_DEPLOY_TIME_ZONE      IANA zone of the shop                         default: America/Argentina/Cordoba
# BRAJA_DEPLOY_PRUNE=false keeps the build cache and dangling images (a machine that also builds other projects).
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

HEALTH_TIMEOUT_SECONDS="${BRAJA_HEALTH_TIMEOUT_SECONDS:-300}"
# Address the health check connects to; only a deploy run from inside a container (local verification) changes it.
HEALTH_CONNECT_IP="${BRAJA_HEALTH_CONNECT_IP:-127.0.0.1}"
MIN_FREE_KB=$((3 * 1024 * 1024))
mode="deploy"
force="${BRAJA_DEPLOY_FORCE:-false}"
for arg in "$@"; do
  case "$arg" in
    --rollback) mode="rollback" ;;
    --force) force=true ;;
    *) die "usage: bash deploy/deploy.sh [--force] [--rollback]" ;;
  esac
done

# A setting from the environment, else from deploy/.env, else the default ($2).
setting() {
  local value="${!1:-}"
  [ -n "$value" ] || value="$(env_get "$1")"
  printf '%s' "${value:-$2}"
}

zone_exists() { [ -f "/usr/share/zoneinfo/$1" ]; }

# True when weekday $1 (1-7) is in $2, a list of days or ranges such as "1-6" or "1,3,5".
day_in() {
  local day="$1" part parts
  IFS=, read -ra parts <<< "$2"
  for part in "${parts[@]}"; do
    case "$part" in
      [1-7]-[1-7]) if [ "$day" -ge "${part%-*}" ] && [ "$day" -le "${part#*-}" ]; then return 0; fi ;;
      [1-7]) if [ "$day" = "$part" ]; then return 0; fi ;;
      *) die "BRAJA_DEPLOY_BLOCKED_DAYS must list ISO weekdays (1 = Monday) or ranges, e.g. 1-6; found '$2'" ;;
    esac
  done
  return 1
}

# Succeeds when now is inside the blocked shop-hours window and leaves the reason in SHOP_HOURS_REASON. Called
# directly, never in $(...): a die on a bad setting must stop the deploy, not just a subshell.
SHOP_HOURS_REASON=""
in_shop_hours() {
  local days from to tz now_day now_hm
  days="$(setting BRAJA_DEPLOY_BLOCKED_DAYS 1-6)"
  from="$(setting BRAJA_DEPLOY_BLOCKED_FROM 08:00)"
  to="$(setting BRAJA_DEPLOY_BLOCKED_UNTIL 19:00)"
  tz="$(setting BRAJA_DEPLOY_TIME_ZONE America/Argentina/Cordoba)"
  [[ "$from" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || die "BRAJA_DEPLOY_BLOCKED_FROM must be HH:MM; found '$from'"
  [[ "$to" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || die "BRAJA_DEPLOY_BLOCKED_UNTIL must be HH:MM; found '$to'"
  # An unknown zone would make date fall back to UTC without a word.
  zone_exists "$tz" || die "BRAJA_DEPLOY_TIME_ZONE '$tz' is not a time zone on this machine (/usr/share/zoneinfo)"
  now_day="$(TZ="$tz" date +%u)"
  now_hm="$(TZ="$tz" date +%H%M)"
  day_in "$now_day" "$days" || return 1
  [ $((10#$now_hm)) -ge $((10#${from/:/})) ] && [ $((10#$now_hm)) -lt $((10#${to/:/})) ] || return 1
  SHOP_HOURS_REASON="it is $(TZ="$tz" date '+%A %H:%M') in $tz, inside the shop hours (days $days, $from to $to): the backend swap cuts the API for 30 to 60 s"
}

guard_shop_hours() {
  in_shop_hours || return 0
  if [ "$force" = true ]; then log "WARNING (forced): $SHOP_HOURS_REASON"; return 0; fi
  die "$SHOP_HOURS_REASON. Deploy outside those hours, or pass --force for an urgent fix (a rollback needs no --force)"
}

guard_main() {
  local head main
  if ! git -C "$REPO_DIR" fetch --quiet origin main; then
    [ "$force" = true ] || die "could not fetch origin/main, so HEAD cannot be checked against it; retry, or pass --force"
    log "WARNING (forced): could not fetch origin/main; HEAD was not checked against it"
    return 0
  fi
  head="$(git -C "$REPO_DIR" rev-parse HEAD)"
  main="$(git -C "$REPO_DIR" rev-parse origin/main)"
  [ "$head" != "$main" ] || { log "HEAD is origin/main ($(git -C "$REPO_DIR" rev-parse --short=12 HEAD)); check that its CI is green"; return 0; }
  local reason="HEAD ($head) is not origin/main ($main)"
  if git -C "$REPO_DIR" merge-base --is-ancestor HEAD origin/main; then reason="$reason: it is an older commit of main (git pull --ff-only)"; fi
  if [ "$force" = true ]; then log "WARNING (forced): $reason"; return 0; fi
  die "$reason. Only main with green CI is deployed (rule 31); pass --force to deploy it anyway"
}

preflight() {
  command -v docker >/dev/null || die "docker is not installed (run deploy/bootstrap-vps.sh)"
  docker info >/dev/null 2>&1 || die "cannot reach the Docker daemon (is this user in the docker group? log in again after bootstrap)"
  docker compose version >/dev/null 2>&1 || die "the docker compose plugin is missing"
  command -v curl >/dev/null || die "curl is required"
  [ -f "$ENV_FILE" ] || die "$ENV_FILE not found; create it with: bash deploy/gen-secrets.sh --help"
  local perms
  perms="$(stat -c %a "$ENV_FILE" 2>/dev/null || stat -f %Lp "$ENV_FILE")"
  [ "$perms" = 600 ] || die "$ENV_FILE has mode $perms; it must be 600: chmod 600 $ENV_FILE"
  [ -n "$(env_get BRAJA_DOMAIN)" ] || die "BRAJA_DOMAIN is empty in $ENV_FILE"
  if [ -n "$(git -C "$REPO_DIR" status --porcelain)" ]; then
    git -C "$REPO_DIR" status --short >&2
    die "the checkout has uncommitted changes; deploy only committed code (git stash or git checkout first)"
  fi
  local free_kb
  free_kb="$(df -Pk "$REPO_DIR" | awk 'NR==2 {print $4}')"
  [ "$free_kb" -ge "$MIN_FREE_KB" ] || die "less than 3 GB free on disk ($((free_kb / 1024)) MB); free space first (docker image prune)"
  compose config --quiet || die "docker-compose.yml or $ENV_FILE is invalid"
}

health_url() {
  local domain port
  domain="$(env_get BRAJA_DOMAIN)"
  port="$(env_get BRAJA_HTTPS_PORT)"; port="${port:-443}"
  echo "$domain $port"
}

# Waits until GET /api/v1/health answers {"status":"UP"} through Caddy over HTTPS, so DNS-independent TLS, routing and
# the backend are all checked. A real domain must present a valid certificate; only "localhost" uses Caddy's internal CA.
wait_healthy() {
  local domain port insecure="" deadline body
  read -r domain port < <(health_url)
  [ "$domain" = localhost ] && insecure="--insecure"
  deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
  log "Waiting up to ${HEALTH_TIMEOUT_SECONDS}s for https://$domain/api/v1/health"
  while [ "$(date +%s)" -lt "$deadline" ]; do
    body="$(curl -fsS $insecure --max-time 5 --resolve "$domain:$port:$HEALTH_CONNECT_IP" "https://$domain:$port/api/v1/health" 2>/dev/null || true)"
    if [ "$body" = '{"status":"UP"}' ]; then log "Healthy"; return 0; fi
    sleep 5
  done
  # Tell the operator which half failed: a healthy backend behind a Caddy without a certificate (DNS not pointing
  # here yet, Let's Encrypt not issued) is a different problem from a backend that does not start.
  if compose exec -T backend curl -fsS --max-time 5 http://127.0.0.1:8080/api/v1/health >/dev/null 2>&1; then
    log "The backend is healthy, but https://$domain/api/v1/health does not answer through Caddy: check DNS (an A record to this server) and the certificate (docker compose -p braja logs caddy)"
  else
    log "The backend itself is not healthy"
  fi
  return 1
}

bootstrap_still_enabled() { [ "$(env_get BRAJA_BOOTSTRAP_ENABLED)" = true ]; }

companies_exist() {
  local table
  table="$(mysql_app "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'companies'")"
  [ "$table" = 1 ] && [ "$(mysql_app 'SELECT COUNT(*) FROM companies')" != 0 ]
}

# The first-ADMIN bootstrap runs once on an empty database and makes every later start fail, so it is turned off
# (and its password removed from .env) as soon as the first deploy is healthy.
disable_bootstrap() {
  bootstrap_still_enabled || return 0
  log "First ADMIN created; turning the bootstrap off and removing its password from $ENV_FILE"
  env_set BRAJA_BOOTSTRAP_ENABLED false
  env_set BRAJA_BOOTSTRAP_PASSWORD ""
  BRAJA_IMAGE_TAG="$1" compose up -d backend
  wait_healthy || die "the backend did not come back after turning the bootstrap off; see: docker compose -p braja logs backend"
}

# Removes braja-backend and braja-caddy images other than the current and previous tags (never any other image).
prune_old_images() {
  local keep_current="$1" keep_previous="$2" image
  for image in $(docker image ls --format '{{.Repository}}:{{.Tag}}' braja-backend; docker image ls --format '{{.Repository}}:{{.Tag}}' braja-caddy); do
    case "${image#*:}" in "$keep_current"|"$keep_previous"|"<none>") continue ;; esac
    if docker image rm "$image" >/dev/null 2>&1; then log "Removed old image $image"; fi
  done
}

# Each build leaves cache and untagged images behind; without pruning, the disk fills up deploy after deploy. Dangling
# images have no tag, so the previous braja-* image kept for the rollback is never one of them; cache used in the last
# 7 days stays, so the next build of a small change is still fast. A failure here never fails a healthy deploy.
prune_build_leftovers() {
  [ "$(setting BRAJA_DEPLOY_PRUNE true)" = true ] || { log "BRAJA_DEPLOY_PRUNE=false: build cache and dangling images kept"; return 0; }
  docker image prune -f >/dev/null 2>&1 || log "WARNING: docker image prune failed; check the disk with: docker system df"
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || log "WARNING: docker builder prune failed; check the disk with: docker system df"
  log "Disk after pruning: $(df -Ph "$REPO_DIR" | awk 'NR==2 {print $4 " free of " $2}')"
}

diagnose() {
  log "Last backend log lines:"
  compose logs --tail 60 backend >&2 || true
  log "Last Caddy log lines:"
  compose logs --tail 20 caddy >&2 || true
}

start_tag() {
  BRAJA_IMAGE_TAG="$1" compose up -d --remove-orphans backend caddy
}

preflight
current="$(state_get CURRENT_TAG)"
previous="$(state_get PREVIOUS_TAG)"

if [ "$mode" = rollback ]; then
  [ -n "$previous" ] || die "there is no previous deployment to roll back to"
  compose up -d --wait mysql
  backup="$(bash "$DEPLOY_DIR/backup.sh" --allow-offhost-failure)"
  log "Rolling back from $current to $previous (backup: $backup)"
  start_tag "$previous"
  wait_healthy || { diagnose; die "the previous images are not healthy either; restore a backup: bash deploy/restore.sh <file>"; }
  state_set CURRENT_TAG "$previous"; state_set PREVIOUS_TAG "$current"
  log "Rolled back to $previous. If $current had migrated the database and $previous misbehaves, restore the backup taken before $current was deployed (see its deploy output)."
  exit 0
fi

guard_main
guard_shop_hours
tag="$(git -C "$REPO_DIR" rev-parse --short=12 HEAD)"
log "Deploying $tag (currently deployed: ${current:-nothing})"

log "Building images braja-backend:$tag and braja-caddy:$tag"
# One at a time: the Maven and npm builds together do not fit comfortably in 4 GB next to a running MySQL.
BRAJA_IMAGE_TAG="$tag" compose build --pull backend
BRAJA_IMAGE_TAG="$tag" compose build --pull caddy
# A first build takes 8 to 12 minutes: started just before the shop opens, the swap would land inside its hours. The
# images stay built, so running deploy.sh again later is quick.
guard_shop_hours

compose up -d --wait --wait-timeout 180 mysql
if bootstrap_still_enabled && companies_exist; then
  # A first deploy whose health gate failed (DNS or certificate not ready yet) already created the first ADMIN; the
  # bootstrap would now make the backend refuse to start, and its password must not stay in .env.
  log "The database already has a company: turning the bootstrap off and removing its password from $ENV_FILE"
  env_set BRAJA_BOOTSTRAP_ENABLED false
  env_set BRAJA_BOOTSTRAP_PASSWORD ""
fi

schema_before="$(schema_version)"
backup="$(bash "$DEPLOY_DIR/backup.sh" --allow-offhost-failure)"
log "Backup before migrating: $backup (schema $schema_before)"

log "Starting $tag"
start_tag "$tag"
if wait_healthy; then
  if [ "$tag" != "$current" ]; then
    state_set PREVIOUS_TAG "$current"
    state_set CURRENT_TAG "$tag"
  fi
  disable_bootstrap "$tag"
  prune_old_images "$tag" "$(state_get PREVIOUS_TAG)"
  prune_build_leftovers
  log "Deployed $tag (schema $(schema_version))"
  exit 0
fi

log "DEPLOY FAILED: $tag did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s"
diagnose
schema_after="$(schema_version 2>/dev/null || echo unknown)"
if [ -n "$current" ] && [ "$current" != "$tag" ]; then
  log "Rolling back to $current"
  start_tag "$current"
  if wait_healthy; then
    log "Rolled back: $current is serving again."
  else
    diagnose
    log "The rollback to $current is not healthy either."
  fi
else
  log "There is no previous deployment to roll back to; the stack is left as it is for inspection."
fi
if [ "$schema_after" != "$schema_before" ]; then
  log "DATABASE: migrations ran during this attempt (schema $schema_before -> $schema_after) and are NOT undone automatically."
  log "If the previous version misbehaves with the new schema, restore the backup taken just before:"
  log "    bash deploy/restore.sh $backup"
else
  log "DATABASE: no migration ran (schema still $schema_before); no restore is needed."
fi
exit 1
