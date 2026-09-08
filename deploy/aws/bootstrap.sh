#!/usr/bin/env bash
set -euo pipefail
# Invoked by cloud-init with only non-secret deployment parameters.
REGION="$1"
ENV_PARAMETER="$2"
DOMAIN_NAME="$3"
umask 077
install -d -m 700 /etc/travo
install -d /var/lib/travo/index /var/lib/travo/caddy-data /var/lib/travo/caddy-config
chown 1000:1000 /var/lib/travo/index
aws ssm get-parameter --region "$REGION" --name "$ENV_PARAMETER" --with-decryption --query Parameter.Value --output text > /etc/travo/app.env
# Docker's env-file does not interpret shell quotes or export statements.
if grep -qE '^(export |[A-Z_]+=\x22|[A-Z_]+=\x27)' /etc/travo/app.env; then
    echo 'Use unquoted KEY=value entries in the SecureString environment file' >&2
    exit 1
fi
# The deployment controls networking; secrets and provider settings come from SSM.
sed -i '/^\(NODE_ENV\|PORT\|HOST\|TRUST_PROXY\|CORS_ORIGINS\|RAG_INDEX_DIR\)=/d' /etc/travo/app.env
printf '\nNODE_ENV=production\nPORT=5000\nHOST=127.0.0.1\nTRUST_PROXY=loopback\nRAG_INDEX_DIR=/app/vectra_index\nCORS_ORIGINS=https://%s\n' "$DOMAIN_NAME" >> /etc/travo/app.env
printf 'DOMAIN_NAME=%s\n' "$DOMAIN_NAME" > /etc/travo/proxy.env
chmod 600 /etc/travo/*.env
cd /opt/travo
docker build --pull -t travo-app:current .
docker pull caddy:2-alpine
install -m 644 deploy/aws/travo.service deploy/aws/travo-proxy.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now travo.service travo-proxy.service
for attempt in $(seq 1 90); do
    if curl --fail --silent http://127.0.0.1:5000/health/ready > /dev/null; then
        echo 'TravoAI is ready on loopback; point the domain at the instance IP to finish HTTPS.'
        exit 0
    fi
    sleep 5
done
echo 'Application readiness failed. Inspect journalctl -u travo.service; do not print app.env.' >&2
exit 1
