#!/usr/bin/env bash
# Emite/reverifica o certificado SSL e recarrega o Nginx.
set -euo pipefail

DOMAIN="crm.inovapro.cloud"

if ! command -v certbot >/dev/null 2>&1; then
  echo "certbot não instalado. Instale: sudo apt install certbot python3-certbot-nginx"
  exit 1
fi

echo "==> Verificando o Nginx"
sudo nginx -t

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  echo "==> Certificado já existe. Tentando renovar..."
  sudo certbot renew --nginx
else
  echo "==> Emitindo certificado para ${DOMAIN}"
  sudo certbot --nginx -d "${DOMAIN}"
fi

echo "==> Recarregando Nginx"
sudo systemctl reload nginx

echo "==> SSL OK."
