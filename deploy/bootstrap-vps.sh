#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 VPS (CLAUDE.md rule 33). Run as root:
#
#   sudo bash bootstrap-vps.sh [deploy-user]      (default user: braja)
#
# Installs Docker Engine and the compose plugin from Docker's apt repository, adds a 2 GB swap file, allows only
# SSH (22), HTTP (80) and HTTPS (443) through ufw, turns on unattended security upgrades and creates a non-root deploy
# user in the docker group. SSH password login is disabled only when an authorized key exists, so the operator is never
# locked out. Safe to run again.
set -euo pipefail

DEPLOY_USER="${1:-braja}"
log() { printf '[bootstrap] %s\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "run as root: sudo bash $0" >&2; exit 1; }
. /etc/os-release
[ "${ID:-}" = ubuntu ] || { echo "this script supports Ubuntu (found ${ID:-unknown})" >&2; exit 1; }
[ "${VERSION_ID:-}" = "24.04" ] || log "WARNING: written for Ubuntu 24.04, found ${VERSION_ID:-unknown}; continuing"
export DEBIAN_FRONTEND=noninteractive

log "Base packages"
apt-get update -q
apt-get install -y -q ca-certificates curl git openssl ufw unattended-upgrades

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
systemctl enable --now unattended-upgrades >/dev/null

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

log "SSH hardening"
if [ -s /root/.ssh/authorized_keys ] || [ -s "$home/.ssh/authorized_keys" ]; then
  # 01- sorts before Ubuntu's 50-cloud-init.conf; sshd keeps the first value it reads for each option.
  cat > /etc/ssh/sshd_config.d/01-braja-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  sshd -t || { rm -f /etc/ssh/sshd_config.d/01-braja-hardening.conf; log "ERROR: sshd rejected the hardening drop-in; it was removed and SSH is unchanged"; exit 1; }
  systemctl reload ssh
  log "Password login disabled; log in with your SSH key (ssh $DEPLOY_USER@<server-ip>)"
else
  log "WARNING: no authorized SSH key found for root or $DEPLOY_USER; password login is LEFT ENABLED so you are not locked out."
  log "WARNING: add your public key to $home/.ssh/authorized_keys and run this script again to disable password login."
fi

log "Done. Next, as $DEPLOY_USER: git clone the repository, then bash deploy/gen-secrets.sh and bash deploy/deploy.sh"
