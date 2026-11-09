#!/usr/bin/env bash
# Creates deploy/.env (mode 600) with fresh secrets and the non-secret settings of this server.
# Never overwrites an existing file and never prints a secret (CLAUDE.md rule 22).
#
#   bash deploy/gen-secrets.sh --domain fichaje.example.com --vapid-subject mailto:someone@example.com \
#       --admin-dni 30123456 --admin-name "Nombre Apellido" --company "Braja" --site "Sede Centro" \
#       [--time-zone America/Argentina/Buenos_Aires] [--env-file PATH]
#
# The first ADMIN's password is read from the terminal (hidden, twice) or, without a terminal, from the first line of
# stdin. It must have at least 16 characters (BootstrapAdminRunner) and at most 72 bytes (BCrypt). Every variable name comes from
# backend/src/main/resources/application.yml and BrajaProperties.
set -Eeuo pipefail
umask 077
# A failing command must never end the script in silence (2026-11-09, #97: the demo stopped right after the password
# with no message). Only the line number is printed, never a command or a value: they can hold secrets.
trap 'echo "gen-secrets: failed at line $LINENO; nothing was written" >&2' ERR

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
DOMAIN="" VAPID_SUBJECT="" ADMIN_DNI="" ADMIN_NAME="" COMPANY="" SITE=""
TIME_ZONE="America/Argentina/Buenos_Aires"

die() { echo "gen-secrets: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --vapid-subject) VAPID_SUBJECT="${2:-}"; shift 2 ;;
    --admin-dni) ADMIN_DNI="${2:-}"; shift 2 ;;
    --admin-name) ADMIN_NAME="${2:-}"; shift 2 ;;
    --company) COMPANY="${2:-}"; shift 2 ;;
    --site) SITE="${2:-}"; shift 2 ;;
    --time-zone) TIME_ZONE="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

[ -e "$ENV_FILE" ] && die "$ENV_FILE already exists; it is never overwritten. Delete it by hand only if you mean to replace every secret."
command -v openssl >/dev/null || die "openssl is required"

ask() { # ask VAR "question": prompts only when the value is still empty and there is a terminal
  local name="$1" question="$2" answer
  if [ -z "${!name}" ] && [ -t 0 ]; then read -r -p "$question: " answer; printf -v "$name" '%s' "$answer"; fi
  [ -n "${!name}" ] || die "missing value for $question (pass it as an argument)"
}
ask DOMAIN "Domain (e.g. fichaje.example.com or braja.duckdns.org)"
ask VAPID_SUBJECT "VAPID subject (mailto:you@example.com)"
ask ADMIN_DNI "First ADMIN DNI"
ask ADMIN_NAME "First ADMIN display name"
ask COMPANY "Company name"
ask SITE "First site name"

case "$DOMAIN" in *[!A-Za-z0-9.-]*|"") die "the domain must be a bare host name, without scheme or path" ;; esac
case "$VAPID_SUBJECT" in mailto:?*@?*|https://?*) ;; *) die "the VAPID subject must be mailto:<email> or an https:// URL" ;; esac
digits="${ADMIN_DNI//[^0-9]/}"
[ "${#digits}" -ge 7 ] && [ "${#digits}" -le 12 ] || die "the DNI must have 7 to 12 digits"
case "$TIME_ZONE" in */*) ;; *) die "the time zone must be an IANA region id such as America/Argentina/Buenos_Aires" ;; esac

if [ -t 0 ]; then
  read -r -s -p "First ADMIN password (16 characters to 72 bytes): " ADMIN_PASSWORD; echo >&2
  read -r -s -p "Repeat it: " again; echo >&2
  [ "$ADMIN_PASSWORD" = "$again" ] || die "the passwords do not match"
  unset again
else
  IFS= read -r ADMIN_PASSWORD || true
  ADMIN_PASSWORD="${ADMIN_PASSWORD%$'\r'}"
fi
# 16 characters is BootstrapAdminRunner's minimum; 72 bytes is what BCrypt verifies (longer passwords would be cut).
password_bytes="$(LC_ALL=C; printf '%s' "${#ADMIN_PASSWORD}")"
if [ "${#ADMIN_PASSWORD}" -lt 16 ] || [ "$password_bytes" -gt 72 ]; then
  die "the ADMIN password must have at least 16 characters and at most 72 bytes"
fi

for value in "$DOMAIN" "$VAPID_SUBJECT" "$ADMIN_DNI" "$ADMIN_NAME" "$COMPANY" "$SITE" "$TIME_ZONE" "$ADMIN_PASSWORD"; do
  case "$value" in *"'"*|*$'\n'*|*$'\r'*) die "values must not contain single quotes or line breaks" ;; esac
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# tr also drops \r: openssl in Git Bash on Windows ends its text output with CRLF.
key32() { openssl rand -base64 32 | tr -d '\r\n'; }
password() { openssl rand -hex 24 | tr -d '\r\n'; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '=\r\n'; }

# VAPID key pair on P-256 in the format web-push-java's PushService(String, String, String) loads: the public key is the
# uncompressed point (65 bytes, 0x04 first) and the private key the raw 32-byte scalar, both base64url without padding.
# They are cut from the SEC1 DER of the key: 30 77 02 01 01 04 20 <d:32> a0 0a <curve oid> a1 44 03 42 00 <point:65>.
openssl ecparam -name prime256v1 -genkey -noout -out "$work/vapid.pem" 2>/dev/null \
  || die "openssl could not create the VAPID key ($(command -v openssl)); Git for Windows ships one in /mingw64/bin (which -a openssl)"
openssl ec -in "$work/vapid.pem" -outform DER -out "$work/vapid.der" 2>/dev/null \
  || die "openssl could not convert the VAPID key ($(command -v openssl)); Git for Windows ships one in /mingw64/bin (which -a openssl)"
[ "$(wc -c < "$work/vapid.der" | tr -d ' ')" = 121 ] || die "unexpected VAPID key encoding from openssl"
[ "$(head -c 7 "$work/vapid.der" | od -An -tx1 | tr -d ' \n')" = "30770201010420" ] || die "unexpected VAPID key encoding from openssl"
[ "$(tail -c 65 "$work/vapid.der" | head -c 1 | od -An -tx1 | tr -d ' \n')" = "04" ] || die "unexpected VAPID public key encoding"
VAPID_PRIVATE="$(tail -c +8 "$work/vapid.der" | head -c 32 | b64url)"
VAPID_PUBLIC="$(tail -c 65 "$work/vapid.der" | b64url)"

HEALTH_KEY="$(key32)"
LOGIN_IP_KEY="$(key32)"
PUSH_KEY="$(key32)"
[ "$HEALTH_KEY" != "$LOGIN_IP_KEY" ] || die "random generator returned the same key twice"

q() { printf "'%s'" "$1"; }
tmp="$work/env"
{
  echo "# Generated by deploy/gen-secrets.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Mode 600, never commit, never paste."
  echo "# Keep a copy outside the server (a password manager): losing BRAJA_HEALTH_ENCRYPTION_KEY_BASE64 makes"
  echo "# stored SALUD motives unreadable. Comments and names: deploy/.env.template."
  echo
  echo "BRAJA_DOMAIN=$(q "$DOMAIN")"
  echo
  echo "SPRING_DATASOURCE_PASSWORD=$(q "$(password)")"
  echo "BRAJA_DB_ROOT_PASSWORD=$(q "$(password)")"
  echo
  echo "BRAJA_HEALTH_ENCRYPTION_KEY_BASE64=$(q "$HEALTH_KEY")"
  echo "BRAJA_LOGIN_IP_THROTTLE_KEY_BASE64=$(q "$LOGIN_IP_KEY")"
  echo "BRAJA_PUSH_SUBSCRIPTION_ENCRYPTION_KEY_BASE64=$(q "$PUSH_KEY")"
  echo "BRAJA_VAPID_PUBLIC_KEY=$(q "$VAPID_PUBLIC")"
  echo "BRAJA_VAPID_PRIVATE_KEY=$(q "$VAPID_PRIVATE")"
  echo "BRAJA_VAPID_SUBJECT=$(q "$VAPID_SUBJECT")"
  echo
  echo "BRAJA_NETWORK_SUBNET='172.31.81.0/24'"
  echo "BRAJA_CADDY_IPV4='172.31.81.10'"
  echo
  echo "BRAJA_BOOTSTRAP_ENABLED='true'"
  echo "BRAJA_BOOTSTRAP_DNI=$(q "$ADMIN_DNI")"
  echo "BRAJA_BOOTSTRAP_PASSWORD=$(q "$ADMIN_PASSWORD")"
  echo "BRAJA_BOOTSTRAP_ADMIN_NAME=$(q "$ADMIN_NAME")"
  echo "BRAJA_BOOTSTRAP_COMPANY_NAME=$(q "$COMPANY")"
  echo "BRAJA_BOOTSTRAP_SITE_NAME=$(q "$SITE")"
  echo "BRAJA_BOOTSTRAP_TIME_ZONE=$(q "$TIME_ZONE")"
} > "$tmp"
unset ADMIN_PASSWORD HEALTH_KEY LOGIN_IP_KEY PUSH_KEY VAPID_PRIVATE

mkdir -p "$(dirname "$ENV_FILE")"
# Refuses to replace a file that appeared meanwhile (set -o noclobber).
( set -o noclobber; cat "$tmp" > "$ENV_FILE" ) || die "$ENV_FILE appeared while generating; nothing was overwritten"
chmod 600 "$ENV_FILE"
echo "Created $ENV_FILE (mode 600) with new secrets for $DOMAIN. No secret was printed."
echo "Next: bash deploy/deploy.sh"
