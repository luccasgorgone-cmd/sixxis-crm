# Dockerfile do sixxis-crm. Converte o build (antes Nixpacks) para incluir o
# tailscaled em modo USERSPACE (a Railway nao tem /dev/net/tun), de forma que o
# container alcance o Ollama local pela tailnet SEM expor nada publico. Apenas a
# chamada do Ollama usa o proxy (ver openaiCompativel.ts: envProxy=OLLAMA_HTTP_
# PROXY); o resto do app (DB/Anthropic/Evolution/Redis) sai direto.
FROM node:22-bookworm-slim

# Tailscale pelo repo oficial (debian bookworm) + utilitarios minimos de build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
       -o /usr/share/keyrings/tailscale-archive-keyring.gpg \
  && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \
       -o /etc/apt/sources.list.d/tailscale.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends tailscale \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias primeiro (camada cacheavel). O postinstall roda `prisma generate`,
# que precisa do schema + prisma.config.ts — por isso eles sao copiados ANTES do
# npm ci. --foreground-scripts garante que os postinstall (prisma, esbuild) rodem
# de verdade no build nao-interativo.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --foreground-scripts

# Codigo + build do Next e do client Prisma.
COPY . .
RUN npx prisma generate && npm run build

# Entrypoint: sobe tailscaled (userspace) + autentica + inicia o app.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
# A Railway injeta PORT em runtime; server.ts ja le process.env.PORT.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
