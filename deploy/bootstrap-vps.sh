#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 VPS (CLAUDE.md rule 33). Run as root:
#
#   sudo bash bootstrap-vps.sh [deploy-user]      (default user: braja)
#
# Installs Docker Engine and the compose plugin from Docker's apt repository, rclone (encrypted off-host backup copies)
# and cron, checks that the clock is synchronized (every mark takes the server time, rule 1), adds a 2 GB swap file,
# allows only SSH (22), HTTP (80) and HTTPS (443) through ufw, turns on unattended security upgrades with an automatic
# reboot outside shop hours, creates a non-root deploy user in the docker group and installs the backup cron for it.
# SSH password login is disabled only when an authorized key exists, and root login only when the deploy user has a
# usable key (it then gets sudo), so the operator is never locked out. Safe to run again.
#
# Optional settings, as environment variables (the server clock is UTC; Argentina is UTC-3 with no daylight saving):
#   BRAJA_REPO_DIR                   checkout the cron runs backup.sh from        default: ~<deploy-user>/fichaje
#   BRAJA_BACKUP_SCHEDULE            cron schedule of the backup, 5 fields        default: "15 6 * * *" (03:15 Cordoba)
#                                    e.g. hourly: "0 * * * *"
#   BRAJA_REBOOT_TIME                reboot after a security upgrade that needs it, HH:MM   default: 07:30 (04:30 Cordoba)
#   BRAJA_PERMIT_ROOT_LOGIN          "no" or "prohibit-password"                  default: no
#   BRAJA_TIME_SYNC_TIMEOUT_SECONDS  wait for the clock to synchronize            default: 60
#
#   ssh root@<ip> 'BRAJA_BACKUP_SCHEDULE="0 * * * *" bash /root/bootstrap-vps.sh braja'
set -euo pipefail

DEPLOY_USER="${1:-braja}"
log() { printf '[bootstrap] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

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

[ "$(id -u)" = 0 ] || { echo "run as root: sudo bash $0" >&2; exit 1; }
. /etc/os-release
[ "${ID:-}" = ubuntu ] || { echo "this script supports Ubuntu (found ${ID:-unknown})" >&2; exit 1; }
[ "${VERSION_ID:-}" = "24.04" ] || log "WARNING: written for Ubuntu 24.04, found ${VERSION_ID:-unknown}; continuing"
export DEBIAN_FRONTEND=noninteractive

[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "the deploy user must be a plain user name (lowercase letters, digits, _ and -)"
BACKUP_SCHEDULE="${BRAJA_BACKUP_SCHEDULE:-15 6 * * *}"
REBOOT_TIME="${BRAJA_REBOOT_TIME:-07:30}"
PERMIT_ROOT_LOGIN="${BRAJA_PERMIT_ROOT_LOGIN:-no}"
TIME_SYNC_TIMEOUT="${BRAJA_TIME_SYNC_TIMEOUT_SECONDS:-60}"
valid_cron_schedule "$BACKUP_SCHEDULE" || die "BRAJA_BACKUP_SCHEDULE must be five cron fields (digits, * / , -), e.g. \"0 * * * *\""
[[ "$REBOOT_TIME" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || die "BRAJA_REBOOT_TIME must be HH:MM, e.g. 07:30"
case "$PERMIT_ROOT_LOGIN" in no|prohibit-password) ;; *) die "BRAJA_PERMIT_ROOT_LOGIN must be no or prohibit-password" ;; esac
case "$TIME_SYNC_TIMEOUT" in ''|*[!0-9]*) die "BRAJA_TIME_SYNC_TIMEOUT_SECONDS must be a whole number" ;; esac

log "Base packages"
apt-get update -q
apt-get install -y -q ca-certificates cron curl git openssl rclone ufw unattended-upgrades
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
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ufw status verbose
# Docker publishes ports with its own iptables rules, past ufw: the compose file publishes only 80 and 443 and MySQL
# has no published port, so nothing else is reachable.

log "Unattended security upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
# A kernel or libc fix only applies after a reboot; reboot at a fixed time outside shop hours instead of never. The
# containers come back by themselves (restart: unless-stopped). Read after 50unattended-upgrades, so these values win.
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
usermod -aG docker "$DEPLOY_USER"
home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh"
if [ -s /root/.ssh/authorized_keys ] && [ ! -s "$home/.ssh/authorized_keys" ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "$home/.ssh/authorized_keys"
  log "Copied root's authorized SSH keys to $DEPLOY_USER"
fi
# The docker group is equivalent to root on this host; only the operator's key logs in as this user.

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

# sshd StrictModes ignores an authorized_keys file that is not the user's own or that others can write.
usable_keys() {
  local file="$home/.ssh/authorized_keys"
  [ -s "$file" ] && [ "$(stat -c %U "$file")" = "$DEPLOY_USER" ] \
    && [ -z "$(find "$file" "$home/.ssh" "$home" -maxdepth 0 -perm /022)" ]
}

log "SSH hardening"
if [ -s /root/.ssh/authorized_keys ] || [ -s "$home/.ssh/authorized_keys" ]; then
  root_login=prohibit-password
  if [ "$PERMIT_ROOT_LOGIN" = no ]; then
    if usable_keys; then
      # Without root login, the deploy user needs sudo to administer the server (and to run this script again). It is
      # already root-equivalent through the docker group, so this widens nothing.
      sudo_tmp="$(mktemp)"
      printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$DEPLOY_USER" > "$sudo_tmp"
      visudo -cqf "$sudo_tmp" || { rm -f "$sudo_tmp"; die "visudo rejected the sudoers drop-in; SSH is unchanged"; }
      install -m 440 -o root -g root "$sudo_tmp" /etc/sudoers.d/90-braja-deploy
      rm -f "$sudo_tmp"
      root_login=no
    else
      log "WARNING: $home/.ssh/authorized_keys is missing, empty, not owned by $DEPLOY_USER or writable by others;"
      log "WARNING: root login over SSH stays allowed with a key (prohibit-password) so you are not locked out."
    fi
  fi
  # 01- sorts before Ubuntu's 50-cloud-init.conf; sshd keeps the first value it reads for each option.
  cat > /etc/ssh/sshd_config.d/01-braja-hardening.conf <<EOF
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin $root_login
EOF
  sshd -t || { rm -f /etc/ssh/sshd_config.d/01-braja-hardening.conf; log "ERROR: sshd rejected the hardening drop-in; it was removed and SSH is unchanged"; exit 1; }
  systemctl reload ssh
  log "Password login disabled; log in with your SSH key (ssh $DEPLOY_USER@<server-ip>)"
  if [ "$root_login" = no ]; then
    log "Root login disabled. Before closing this session, check from another terminal: ssh $DEPLOY_USER@<server-ip> sudo true"
    log "To run this script again later: ssh $DEPLOY_USER@<server-ip> 'sudo bash bootstrap-vps.sh $DEPLOY_USER'"
  fi
else
  log "WARNING: no authorized SSH key found for root or $DEPLOY_USER; password login is LEFT ENABLED so you are not locked out."
  log "WARNING: add your public key to $home/.ssh/authorized_keys and run this script again to disable password login."
fi

log "Done. Next, as $DEPLOY_USER: git clone the repository into $repo_dir, then bash deploy/gen-secrets.sh and bash deploy/deploy.sh"
