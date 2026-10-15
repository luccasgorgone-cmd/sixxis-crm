#!/bin/sh
# Entrypoint do container: tailscaled (userspace) -> autentica -> app.
# NAO fatal: se o Tailscale falhar, o app sobe mesmo assim e o Supervisor cai
# no fallback (nunca derruba o CRM por causa da tailnet).
set -eu

echo "[entrypoint] iniciando tailscaled (userspace, proxy em :1055)..."
/usr/sbin/tailscaled \
  --tun=userspace-networking \
  --socks5-server=localhost:1055 \
  --outbound-http-proxy-listen=localhost:1055 \
  --state=mem: &

# Espera o daemon responder (ate ~10s).
i=0
while [ "$i" -lt 20 ]; do
  if tailscale status >/dev/null 2>&1; then break; fi
  i=$((i + 1))
  sleep 0.5
done

if [ -n "${TS_AUTHKEY:-}" ]; then
  echo "[entrypoint] tailscale up (ephemeral + tag:railway)..."
  # TS_AUTHKEY = OAuth client secret (tskey-client-...). ?ephemeral=true remove o
  # no quando o container sai; preauthorized=true dispensa aprovacao manual.
  timeout 30 tailscale up \
    --auth-key="${TS_AUTHKEY}?ephemeral=true&preauthorized=true" \
    --hostname="${TS_HOSTNAME:-sixxis-crm}" \
    --advertise-tags=tag:railway \
    --accept-dns=false \
    || echo "[entrypoint] AVISO: tailscale up falhou/timeout; app segue sem tailnet (fallback)."
else
  echo "[entrypoint] TS_AUTHKEY ausente; sem tailnet (Supervisor usa fallback)."
fi

echo "[entrypoint] iniciando app (npm run start)..."
exec npm run start
