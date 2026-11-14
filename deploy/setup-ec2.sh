#!/usr/bin/env bash
# Adaptado del Anexo B del manual StreamLab. Ubuntu 24.04, usuario ubuntu.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
echo '1/6 Instalando ffmpeg y herramientas'
sudo apt-get update -y -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg git curl ca-certificates libcap2-bin >/dev/null
echo '2/6 Instalando Node.js 22'
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs >/dev/null
fi
echo '3/6 Preparando memoria swap'
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
echo '4/6 Instalando dependencias'
npm ci --omit=dev --no-audit --no-fund
echo '5/6 Configurando la aplicación'
if [ ! -f .env ]; then
  cat > .env <<ENV
PORT=80
RTMP_PORT=1935
PUBLIC_HOST=
FFMPEG_PATH=/usr/bin/ffmpeg
RECORD_VOD=true
HLS_TIME=2
ENV
fi
chmod 600 .env
sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(command -v node)")"
echo '6/6 Iniciando el servicio'
command -v pm2 >/dev/null || sudo npm install -g pm2 --no-audit --no-fund >/dev/null
pm2 delete streamlab >/dev/null 2>&1 || true
pm2 start npm --name streamlab --time -- start
pm2 save
sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME" >/dev/null
sleep 3
curl --fail --silent http://localhost/api/health
echo
pm2 status
