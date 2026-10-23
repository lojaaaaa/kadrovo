FROM node:24-bookworm-slim AS base
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate && chmod -R a+rX /opt/corepack

FROM base AS build
ENV HUSKY=0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm db:generate && pnpm build

FROM caddy:2-alpine AS gateway
# Render disallows elevated file capabilities; port 10000 needs none.
RUN setcap -r /usr/bin/caddy

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HUSKY=0
WORKDIR /app
COPY --from=gateway /usr/bin/caddy /usr/local/bin/caddy
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data/content && chown -R node:node /app/data
USER node
CMD ["pnpm", "--filter", "@filmless/web", "start"]
