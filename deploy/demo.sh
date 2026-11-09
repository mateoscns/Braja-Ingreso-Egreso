#!/usr/bin/env bash
# Demo mode (issue #97): runs the production stack on this PC and publishes it through a Cloudflare quick tunnel, so the
# client can try the PWA over HTTPS (location and push need it) before a server is rented. Not production: the PC must
# stay on, the data lives here, and the https://…trycloudflare.com address changes every time the tunnel restarts.
#
#   bash deploy/demo.sh start        builds and starts everything and prints the URL; the first time it creates
#                                    deploy/.env.demo and asks for the first ADMIN (password hidden)
#   bash deploy/demo.sh url          prints the current URL
#   bash deploy/demo.sh logs [svc]   follows the logs (backend, caddy, mysql or tunnel)
#   bash deploy/demo.sh stop         stops the containers and keeps the data
#   bash deploy/demo.sh down [--wipe]  removes the containers; --wipe also deletes the demo database (asks first)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BRAJA_ENV_FILE="${BRAJA_ENV_FILE:-$(cd "$SCRIPT_DIR" && { pwd -W 2>/dev/null || pwd; })/.env.demo}"
. "$SCRIPT_DIR/lib.sh"

PROJECT=braja-demo
# Own images, network and volumes: nothing is shared with a production stack or any other project on this PC.
export BRAJA_IMAGE_TAG=demo
DEMO_SUBNET=172.31.90.0/24
DEMO_CADDY_IP=172.31.90.10

demo_compose() {
  docker compose -p "$PROJECT" --project-directory "$DEPLOY_DIR" -f "$DEPLOY_DIR/docker-compose.yml" \
    -f "$DEPLOY_DIR/demo/compose.demo.yml" --env-file "$ENV_FILE" "$@"
}

# Same as lib.sh mysql_app, against the demo project; the password never leaves the container.
demo_mysql() {
  demo_compose exec -T mysql bash -c \
    'mysql --defaults-extra-file=<(printf "[client]\nuser=%s\npassword=%s\n" "$MYSQL_USER" "$MYSQL_PASSWORD") -N -B "$MYSQL_DATABASE" -e "$1"' \
    sh "$1"
}

wait_backend() {
  local deadline=$(( $(date +%s) + 300 ))
  log "Waiting up to 300s for the backend"
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if demo_compose exec -T backend curl -fsS --max-time 4 http://127.0.0.1:8080/api/v1/health >/dev/null 2>&1; then return 0; fi
    sleep 5
  done
  return 1
}

# The tunnel prints its address once it is connected; after a restart the newest line is the current one.
tunnel_url() {
  demo_compose logs --no-log-prefix tunnel 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -n 1 || true
}

wait_tunnel() {
  local deadline=$(( $(date +%s) + 120 )) url=""
  log "Waiting up to 120s for the Cloudflare tunnel"
  while [ "$(date +%s)" -lt "$deadline" ]; do
    url="$(tunnel_url)"
    # A new trycloudflare name can take a few seconds to resolve: check it end to end before printing it.
    if [ -n "$url" ] && [ "$(curl -fsS --max-time 10 "$url/api/v1/health" 2>/dev/null || true)" = '{"status":"UP"}' ]; then
      printf '%s' "$url"; return 0
    fi
    sleep 5
  done
  return 1
}

# The first-ADMIN bootstrap runs once on an empty database and makes every later start fail, so it is turned off (and
# its password removed from .env.demo) as soon as a company exists, exactly like deploy.sh does on a server.
disable_bootstrap_if_done() {
  [ "$(env_get BRAJA_BOOTSTRAP_ENABLED)" = true ] || return 0
  [ "$(demo_mysql 'SELECT COUNT(*) FROM companies' 2>/dev/null || echo 0)" != 0 ] || return 0
  log "First ADMIN created: turning the bootstrap off and removing its password from $ENV_FILE"
  env_set BRAJA_BOOTSTRAP_ENABLED false
  env_set BRAJA_BOOTSTRAP_PASSWORD ""
  return 1
}

start() {
  docker info >/dev/null 2>&1 || die "Docker is not running; start Docker Desktop and try again"
  if [ ! -f "$ENV_FILE" ]; then
    log "Creating $ENV_FILE (first run): answer the questions; the password is not shown"
    bash "$DEPLOY_DIR/gen-secrets.sh" --env-file "$ENV_FILE" --domain localhost >&2 \
      || die "could not create $ENV_FILE (see the message above); nothing was started"
  fi
  env_set BRAJA_NETWORK_SUBNET "$DEMO_SUBNET"
  env_set BRAJA_CADDY_IPV4 "$DEMO_CADDY_IP"

  log "Building the demo images (backend, then the PWA in Caddy)"
  demo_compose build --pull backend
  demo_compose build --pull caddy

  demo_compose up -d --wait --wait-timeout 180 mysql
  # A previous start that created the company but stopped before turning the bootstrap off would now fail to start.
  disable_bootstrap_if_done || true

  demo_compose up -d --remove-orphans
  wait_backend || { demo_compose logs --tail 60 backend >&2; die "the backend did not become healthy"; }
  if ! disable_bootstrap_if_done; then
    demo_compose up -d backend
    wait_backend || { demo_compose logs --tail 60 backend >&2; die "the backend did not come back after turning the bootstrap off"; }
  fi

  local url
  url="$(wait_tunnel)" || { demo_compose logs --tail 40 tunnel >&2; die "the tunnel did not answer; run: bash deploy/demo.sh logs tunnel"; }
  log "Demo ready"
  echo
  echo "  URL: $url"
  echo
  echo "  Open it on the phone, sign in with the first ADMIN, install the app (Agregar a inicio) and turn the alerts on."
  echo "  This PC must stay on. If the tunnel restarts the URL changes: bash deploy/demo.sh url"
}

wipe() {
  local answer
  read -r -p "This deletes the demo database and every mark in it. Type BORRAR to continue: " answer
  [ "$answer" = BORRAR ] || die "nothing was deleted"
  demo_compose down -v
}

case "${1:-}" in
  start) start ;;
  url) url="$(tunnel_url)"; [ -n "$url" ] || die "no tunnel address yet; is the demo running? (bash deploy/demo.sh start)"; echo "$url" ;;
  logs) shift; demo_compose logs -f --tail 100 "$@" ;;
  stop) demo_compose stop ;;
  down) if [ "${2:-}" = --wipe ]; then wipe; else demo_compose down; fi ;;
  *) sed -n '2,11p' "$0"; exit 2 ;;
esac
