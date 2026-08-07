#!/usr/bin/env bash
# Setup inicial de un VPS Ubuntu 22.04/24.04 recien contratado, antes de clonar el repo.
# Correr UNA VEZ, como root, recien conectado por SSH.
#
# Uso:
#   ssh root@IP_DEL_VPS
#   curl -fsSL https://raw.githubusercontent.com/<tu-org>/logify/main/Backend/scripts/00-vps-server-setup.sh | bash
#   # o si ya tenes el repo clonado localmente y lo subis por scp:
#   bash 00-vps-server-setup.sh
#
# Que hace (ver wiki/Despliegue-VPS.md pasos 2 y 8):
#   1. Actualiza paquetes del sistema
#   2. Crea el usuario "deploy" (no-root) si no existe
#   3. Configura el firewall (ufw): solo SSH, 80 y 443
#   4. Instala Docker
#   5. Configura rotacion de logs de Docker (evita llenar el disco)
#
# Es idempotente: se puede correr mas de una vez sin romper nada.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Este script debe correrse como root (recien conectado por SSH)." >&2
  exit 1
fi

echo "==> Actualizando paquetes del sistema..."
apt update && apt upgrade -y

echo "==> Creando usuario 'deploy' (si no existe)..."
if ! id -u deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
  usermod -aG sudo deploy
  echo "Usuario 'deploy' creado. Copia tu clave SSH con:"
  echo "  ssh-copy-id deploy@$(hostname -I | awk '{print $1}')"
else
  echo "El usuario 'deploy' ya existe, se omite."
fi

echo "==> Configurando firewall (ufw)..."
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

echo "==> Instalando Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL --proto '=https' --tlsv1.2 https://get.docker.com | sh
else
  echo "Docker ya esta instalado, se omite."
fi
usermod -aG docker deploy

echo "==> Configurando rotacion de logs de Docker..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
systemctl restart docker

echo ""
echo "Listo. A partir de aca, conectate siempre como 'deploy', no como 'root':"
echo "  ssh deploy@$(hostname -I | awk '{print $1}')"
echo ""
echo "Proximo paso: clonar el repo y correr 01-vps-post-clone-setup.sh"
echo "(ver wiki/Despliegue-VPS.md paso 4 en adelante)."
