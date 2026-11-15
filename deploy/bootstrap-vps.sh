#!/usr/bin/env bash
# Preparation of a fresh Ubuntu 24.04 VPS (CLAUDE.md rule 33), in two steps, both run as root:
#
#   1. From the provider's root session, with a terminal (sudo asks for a password set here):
#        ssh -t root@<ip> 'bash /root/bootstrap-vps.sh [deploy-user]'          (default user: braja)
#   2. Only from a SECOND, independent session, logged in as the deploy user with its SSH key, keeping the first open:
#        ssh -t <deploy-user>@<ip> 'sudo bash bootstrap-vps.sh --harden-ssh [deploy-user]'
#
# Step 1 installs Docker Engine and the compose plugin from Docker's apt repository, rclone and age (encrypted off-host
# backup copies) and cron, checks that the clock is synchronized (every mark takes the server time, rule 1), adds a 2 GB swap
# file, allows only SSH (22), HTTP (80) and HTTPS (443) through ufw, turns on unattended security upgrades with an
# automatic reboot outside shop hours, creates the non-root deploy user in the docker and sudo groups (sudo asks for
# that user's password; no passwordless sudo) and installs the backup cron for it. Step 1 never changes SSH.
# Step 2 turns off SSH password login and root login (BRAJA_PERMIT_ROOT_LOGIN), and refuses to unless the deploy user
# has just proved it can administer the server: it runs through that user's sudo, the user has a usable authorized key,
# sshd logged an "Accepted publickey" login for it, and docker works for it. Both steps are safe to run again.
#
# Optional settings, as environment variables (the server clock is UTC; Argentina is UTC-3 with no daylight saving):
#   BRAJA_REPO_DIR                   checkout the cron runs backup.sh from        default: ~<deploy-user>/fichaje
#   BRAJA_BACKUP_SCHEDULE            cron schedule of the backup, 5 fields        default: "15 * * * *" (every hour, D-20261115-04)
#                                    e.g. once a day at 03:15 Cordoba: "15 6 * * *"
#   BRAJA_REBOOT_TIME                reboot after a security upgrade that needs it, HH:MM   default: 07:30 (04:30 Cordoba)
#   BRAJA_PERMIT_ROOT_LOGIN          step 2: "no" or "prohibit-password"          default: no
#   BRAJA_TIME_SYNC_TIMEOUT_SECONDS  wait for the clock to synchronize            default: 60
#   BRAJA_SSH_KEY_LOGIN_VERIFIED     step 2: "yes" skips only the sshd log check, for a server whose sshd logs are gone;
#                                    set it only after logging in as the deploy user with its key yourself
#
#   ssh -t root@<ip> 'BRAJA_BACKUP_SCHEDULE="15 6 * * *" bash /root/bootstrap-vps.sh braja'
#   Through sudo, settings go after it (sudo drops the caller's environment): sudo env BRAJA_...=value bash ...
set -euo pipefail

MODE=setup
DEPLOY_USER=braja
for arg in "$@"; do
  case "$arg" in
    --harden-ssh) MODE=harden-ssh ;;
    -h|--help) sed -n '2,29p' "$0"; exit 0 ;;
    -*) echo "unknown option: $arg (see --help)" >&2; exit 1 ;;
    *) DEPLOY_USER="$arg" ;;
  esac
done
log() { printf '[bootstrap] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

HARDENING_CONF=/etc/ssh/sshd_config.d/01-braja-hardening.conf
# Written by an earlier version of this script (PR #179); passwordless sudo is no longer granted.
LEGACY_SUDOERS=/etc/sudoers.d/90-braja-deploy

# A cron schedule is five fields of digits, "*", "/", "," and "-" only: nothing else can reach the cron file.
valid_cron_schedule() {
  local fields
  case "$1" in ''|*[!0-9*/,\ -]*) return 1 ;; esac
  read -ra fields <<< "$1"
  [ "${#fields[@]}" = 5 ]
}

# The /etc/cron.d file that runs backup.sh as the deploy user; its output goes to the backup log next to the backups.
# Args: schedule, user, repository directory, log file.
backup_cron_file() {
  printf '%s\n' \
    "# Installed by deploy/bootstrap-vps.sh; run it again to change the schedule (BRAJA_BACKUP_SCHEDULE). Server time." \
    "SHELL=/bin/sh" \
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    "$1 $2 { cd $3 && bash deploy/backup.sh; } >> $4 2>&1"
}

# sshd StrictModes ignores an authorized_keys file that is not the user's own or that others can write.
usable_keys() {
  local file="$home/.ssh/authorized_keys"
  [ -s "$file" ] && [ "$(stat -c %U "$file")" = "$DEPLOY_USER" ] \
    && [ -z "$(find "$file" "$home/.ssh" "$home" -maxdepth 0 -perm /022)" ]
}

# Second field of passwd -S: P = usable password, L = locked, NP = none.
password_state() { passwd -S "$DEPLOY_USER" | awk '{print $2}'; }

# Whether sshd logged a public-key login of the deploy user (journal, else /var/log/auth.log). grep -c reads the whole
# stream, so journalctl never dies of SIGPIPE under pipefail.
key_login_logged() {
  local needle="Accepted publickey for $DEPLOY_USER from" count=0
  if command -v journalctl >/dev/null; then
    count="$(journalctl -q --no-pager -o cat SYSLOG_IDENTIFIER=sshd SYSLOG_IDENTIFIER=sshd-session 2>/dev/null \
      | grep -cF "$needle" || true)"
  fi
  [ "${count:-0}" -gt 0 ] && return 0
  grep -qsF "$needle" /var/log/auth.log /var/log/auth.log.1
}

# Listeners on a public address other than SSH, HTTP, HTTPS and the DHCP client: services nobody asked for.
unexpected_listeners() {
  ss -H -tuln 2>/dev/null | awk '{
    sock = $5; n = split(sock, part, ":"); port = part[n]; addr = substr(sock, 1, length(sock) - length(port) - 1)
    if (addr ~ /^(127\.|\[::1\]|\[::ffff:127\.)/ || addr ~ /%lo$/) next
    if (port ~ /^(22|80|443)$/) next
    if ($1 == "udp" && port ~ /^(68|546)$/) next
    print $1 " " sock
  }' | sort -u
}

# Step 2. Every check runs before the first change, and a rejected configuration is rolled back.
harden_ssh() {
  local root_login="$PERMIT_ROOT_LOGIN" previous="" tmp effective expected
  [ "${SUDO_USER:-}" = "$DEPLOY_USER" ] \
    || die "run this from a second session logged in as $DEPLOY_USER with its key: ssh -t $DEPLOY_USER@<server-ip> 'sudo bash bootstrap-vps.sh --harden-ssh $DEPLOY_USER'. That proves $DEPLOY_USER can log in and use sudo before root and password logins are closed. SSH is unchanged."
  usable_keys \
    || die "$home/.ssh/authorized_keys is missing, empty, not owned by $DEPLOY_USER or writable by others; SSH is unchanged"
  if [ "${BRAJA_SSH_KEY_LOGIN_VERIFIED:-}" = yes ]; then
    log "WARNING: BRAJA_SSH_KEY_LOGIN_VERIFIED=yes: not looking for $DEPLOY_USER's key login in the sshd logs"
  else
    key_login_logged \
      || die "sshd has no logged public-key login of $DEPLOY_USER (journalctl -t sshd, /var/log/auth.log). Log in as $DEPLOY_USER with its key and run this again from that session; SSH is unchanged"
  fi
  runuser -u "$DEPLOY_USER" -- docker info >/dev/null 2>&1 \
    || die "docker does not work for $DEPLOY_USER (run step 1 again, then log in again); SSH is unchanged"
  log "$DEPLOY_USER logged in with its key, used sudo and reaches Docker: closing SSH password and root logins"

  [ -f "$HARDENING_CONF" ] && previous="$(cat "$HARDENING_CONF")"
  restore() {
    if [ -n "$previous" ]; then printf '%s\n' "$previous" > "$HARDENING_CONF"; else rm -f "$HARDENING_CONF"; fi
  }
  tmp="$(mktemp)"
  # 01- sorts before Ubuntu's 50-cloud-init.conf; sshd keeps the first value it reads for each option.
  printf '%s\n' \
    "# Installed by deploy/bootstrap-vps.sh --harden-ssh. Rollback (provider console as root, or $DEPLOY_USER with sudo):" \
    "#   rm $HARDENING_CONF && systemctl reload ssh" \
    "PubkeyAuthentication yes" \
    "PasswordAuthentication no" \
    "KbdInteractiveAuthentication no" \
    "PermitRootLogin $root_login" > "$tmp"
  install -m 644 -o root -g root "$tmp" "$HARDENING_CONF"
  rm -f "$tmp"
  # sshd -t needs its privilege separation directory; with Ubuntu 24.04's ssh.socket activation it exists only once
  # sshd has started since boot (a provider console session does not start it).
  install -d -m 755 /run/sshd
  if ! sshd -t; then restore; die "sshd rejected the hardening drop-in; the previous configuration is back and SSH is unchanged"; fi
  effective="$(sshd -T 2>/dev/null)" || { restore; die "sshd -T failed; the previous configuration is back"; }
  # sshd -T (OpenSSH 9.6) prints prohibit-password by its old name, without-password.
  for expected in "pubkeyauthentication yes" "passwordauthentication no" "kbdinteractiveauthentication no" \
      "permitrootlogin ${root_login/prohibit-password/without-password}"; do
    grep -qx "$expected" <<< "$effective" \
      || { restore; die "another sshd_config file overrides '$expected' (sshd -T); the previous configuration is back. Look in /etc/ssh/sshd_config.d/"; }
  done
  # Only authentication options change, so a reload is enough: open sessions stay. Under ssh.socket activation an idle
  # sshd is not running and the next connection starts one with the new file. A Port or ListenAddress change would
  # instead need: systemctl daemon-reload && systemctl restart ssh.socket.
  if systemctl is-active --quiet ssh; then systemctl reload ssh; fi
  log "SSH: key only; root login: $root_login. Keep this session open and check from a THIRD terminal:"
  log "  ssh $DEPLOY_USER@<server-ip> 'sudo -v && docker ps'   must work"
  log "  ssh root@<server-ip>                                  must be refused (if root login is no)"
  log "Rollback if something is wrong: sudo rm $HARDENING_CONF && sudo systemctl reload ssh"
  log "(or, locked out: the provider's browser console as root, checked in step 5.3 of deploy/HOSTINGER_GO_LIVE.md)."
}

[ "$(id -u)" = 0 ] || { echo "run as root: sudo bash $0" >&2; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
[ "${ID:-}" = ubuntu ] || { echo "this script supports Ubuntu (found ${ID:-unknown})" >&2; exit 1; }
[ "${VERSION_ID:-}" = "24.04" ] || log "WARNING: written for Ubuntu 24.04, found ${VERSION_ID:-unknown}; continuing"
export DEBIAN_FRONTEND=noninteractive

[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "the deploy user must be a plain user name (lowercase letters, digits, _ and -)"
BACKUP_SCHEDULE="${BRAJA_BACKUP_SCHEDULE:-15 * * * *}"
REBOOT_TIME="${BRAJA_REBOOT_TIME:-07:30}"
PERMIT_ROOT_LOGIN="${BRAJA_PERMIT_ROOT_LOGIN:-no}"
TIME_SYNC_TIMEOUT="${BRAJA_TIME_SYNC_TIMEOUT_SECONDS:-60}"
valid_cron_schedule "$BACKUP_SCHEDULE" || die "BRAJA_BACKUP_SCHEDULE must be five cron fields (digits, * / , -), e.g. \"15 * * * *\""
[[ "$REBOOT_TIME" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || die "BRAJA_REBOOT_TIME must be HH:MM, e.g. 07:30"
case "$PERMIT_ROOT_LOGIN" in no|prohibit-password) ;; *) die "BRAJA_PERMIT_ROOT_LOGIN must be no or prohibit-password" ;; esac
case "$TIME_SYNC_TIMEOUT" in ''|*[!0-9]*) die "BRAJA_TIME_SYNC_TIMEOUT_SECONDS must be a whole number" ;; esac

if [ "$MODE" = harden-ssh ]; then
  id "$DEPLOY_USER" >/dev/null 2>&1 || die "user $DEPLOY_USER does not exist; run step 1 first"
  home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
  harden_ssh
  exit 0
fi

log "Base packages"
apt-get update -q
# age encrypts each backup before it leaves the server (BRAJA_BACKUP_AGE_RECIPIENTS in deploy/backup.sh).
apt-get install -y -q age ca-certificates cron curl git openssl rclone ufw unattended-upgrades
systemctl enable --now cron >/dev/null

log "Clock synchronization (marks take the server time)"
if ! timedatectl set-ntp true 2>/dev/null; then
  # No NTP service at all: install systemd-timesyncd, unless another time daemon is there (they conflict).
  if ! dpkg -s chrony >/dev/null 2>&1 && ! dpkg -s ntpsec >/dev/null 2>&1 && ! dpkg -s ntp >/dev/null 2>&1; then
    apt-get install -y -q systemd-timesyncd
  fi
  timedatectl set-ntp true || die "could not turn on NTP (timedatectl set-ntp true); fix time synchronization before deploying"
fi
synced=no
for _ in $(seq 0 2 "$TIME_SYNC_TIMEOUT"); do
  synced="$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo no)"
  [ "$synced" = yes ] && break
  sleep 2
done
[ "$synced" = yes ] || die "the clock is not synchronized after ${TIME_SYNC_TIMEOUT}s (timedatectl timesync-status; is outgoing UDP 123 blocked?). Every mark takes this clock: do not deploy until 'timedatectl' says 'System clock synchronized: yes'"
log "Clock synchronized: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
server_tz="$(timedatectl show -p Timezone --value 2>/dev/null || echo unknown)"
case "$server_tz" in UTC|Etc/UTC) ;; *) log "WARNING: the server time zone is $server_tz, not UTC: BRAJA_BACKUP_SCHEDULE and BRAJA_REBOOT_TIME are read in that zone" ;; esac

log "Docker Engine and compose plugin (download.docker.com)"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker compose version

log "Swap file (2 GB)"
if ! swapon --show=NAME --noheadings | grep -q .; then
  [ -f /swapfile ] || fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-braja-swappiness.conf
sysctl -q --system

log "Firewall: 22, 80 and 443 only"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
# HTTP/3: docker-compose.yml publishes 443/udp for Caddy.
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ufw status verbose
# Docker publishes ports with its own iptables rules, past ufw: the compose file publishes only Caddy's 80 and 443 and
# MySQL and the backend have no published port, so nothing else is reachable. The provider firewall is the outer layer.
others="$(unexpected_listeners)"
if [ -n "$others" ]; then
  log "WARNING: listening on a public address besides 22, 80 and 443 (ufw blocks them, but stop what is not needed):"
  printf '%s\n' "$others" | sed 's/^/[bootstrap]   /'
fi

log "Unattended security upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
# A kernel or libc fix only applies after a reboot; reboot at a fixed time outside shop hours (Monday to Saturday,
# 08:00 to 19:00 in Cordoba) instead of never. The containers come back by themselves (restart: unless-stopped). Read
# after 50unattended-upgrades, so these values win.
cat > /etc/apt/apt.conf.d/52braja-auto-reboot <<EOF
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "$REBOOT_TIME";
EOF
systemctl enable --now unattended-upgrades >/dev/null
log "Automatic reboot after upgrades that need it: $REBOOT_TIME server time"

log "Deploy user: $DEPLOY_USER"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER" >/dev/null
fi
# The docker group is equivalent to root on this host; only the operator's key logs in as this user (after step 2).
# sudo comes from Ubuntu's sudo group (%sudo ALL=(ALL:ALL) ALL): it asks for the user's own password every time.
usermod -aG docker,sudo "$DEPLOY_USER"
home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
# deploy/.env (mode 600) and the backups live under this home: no other local user may even list it.
chmod 750 "$home"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh"
if [ -s /root/.ssh/authorized_keys ] && [ ! -s "$home/.ssh/authorized_keys" ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "$home/.ssh/authorized_keys"
  log "Copied root's authorized SSH keys to $DEPLOY_USER"
fi
if [ "$(password_state)" != P ]; then
  if [ -t 0 ]; then
    log "Choose the password $DEPLOY_USER types for sudo (keep it in the password manager; SSH never accepts it after step 2)"
    for _ in 1 2 3; do passwd "$DEPLOY_USER" && break; done || true
  fi
  [ "$(password_state)" = P ] \
    || log "WARNING: $DEPLOY_USER has no password, so its sudo does not work yet. Set one as root (passwd $DEPLOY_USER) or run this again with a terminal (ssh -t)"
fi
if [ -f "$LEGACY_SUDOERS" ]; then
  if [ "$(password_state)" = P ]; then
    rm -f "$LEGACY_SUDOERS"
    log "Removed the passwordless sudo rule $LEGACY_SUDOERS: sudo now asks for the password of $DEPLOY_USER"
  else
    log "WARNING: kept the passwordless sudo rule $LEGACY_SUDOERS until $DEPLOY_USER has a password (it may be the only admin path)"
  fi
fi

log "Backup cron for $DEPLOY_USER"
repo_dir="${BRAJA_REPO_DIR:-$home/fichaje}"
case "$repo_dir" in /*) ;; *) die "BRAJA_REPO_DIR must be an absolute path" ;; esac
case "$repo_dir$home" in *[!A-Za-z0-9/._-]*) die "BRAJA_REPO_DIR and the home of $DEPLOY_USER may only hold letters, digits and / . _ -" ;; esac
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/braja-backups"
cron_tmp="$(mktemp)"
backup_cron_file "$BACKUP_SCHEDULE" "$DEPLOY_USER" "$repo_dir" "$home/braja-backups/backup.log" > "$cron_tmp"
install -m 644 -o root -g root "$cron_tmp" /etc/cron.d/braja-backup
rm -f "$cron_tmp"
log "Backup schedule: '$BACKUP_SCHEDULE' (server time), log: $home/braja-backups/backup.log"
[ -f "$repo_dir/deploy/backup.sh" ] || log "Note: $repo_dir is not cloned yet; the backup cron fails (and says so in its log) until it is"

if [ -f "$HARDENING_CONF" ]; then
  log "SSH: already hardened by step 2 ($HARDENING_CONF); unchanged"
else
  log "SSH: unchanged (password and root logins still work). Step 2, keeping THIS session open:"
  usable_keys || log "  first put your public key in $home/.ssh/authorized_keys (owned by $DEPLOY_USER, mode 600)"
  log "  from another terminal: scp bootstrap-vps.sh $DEPLOY_USER@<server-ip>:"
  log "  then: ssh -t $DEPLOY_USER@<server-ip> 'sudo bash bootstrap-vps.sh --harden-ssh $DEPLOY_USER'"
fi
log "Done. Next, as $DEPLOY_USER: git clone the repository into $repo_dir, then bash deploy/gen-secrets.sh and bash deploy/deploy.sh"
