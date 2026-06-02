FROM node:24.15.0-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@10.33.1 --activate

WORKDIR /workspace

FROM base AS build

ARG API_BASE_PATH=/api
ARG API_PROXY_TARGET=http://localhost:3001
ARG NEXT_PUBLIC_API_BASE_PATH=/api
ARG NEXT_PUBLIC_WEB_CLIENT_TELEMETRY_ENABLED=false
ENV API_BASE_PATH=$API_BASE_PATH
ENV API_PROXY_TARGET=$API_PROXY_TARGET
ENV NEXT_PUBLIC_API_BASE_PATH=$NEXT_PUBLIC_API_BASE_PATH
ENV NEXT_PUBLIC_WEB_CLIENT_TELEMETRY_ENABLED=$NEXT_PUBLIC_WEB_CLIENT_TELEMETRY_ENABLED

COPY . .

RUN pnpm install --frozen-lockfile
RUN API_BASE_PATH=$API_BASE_PATH NEXT_PUBLIC_API_BASE_PATH=$NEXT_PUBLIC_API_BASE_PATH API_PROXY_TARGET=$API_PROXY_TARGET NEXT_PUBLIC_WEB_CLIENT_TELEMETRY_ENABLED=$NEXT_PUBLIC_WEB_CLIENT_TELEMETRY_ENABLED pnpm --filter @balance/web build

FROM build AS profiler-deps

SHELL ["/bin/ash", "-eo", "pipefail", "-c"]

RUN set -eux; \
  mkdir -p /profiler-node-modules/.pnpm /profiler-node-modules/@pyroscope /profiler-node-modules/@datadog; \
  for pattern in \
    '@pyroscope+nodejs@*' \
    '@datadog+pprof@*' \
    'debug@*' \
    'delay@*' \
    'node-gyp-build@3*' \
    'p-limit@3*' \
    'p-limit@7*' \
    'pprof-format@*' \
    'regenerator-runtime@*' \
    'source-map@0.7*' \
    'yocto-queue@0.1*' \
    'yocto-queue@1.2*'; do \
    find node_modules/.pnpm -maxdepth 1 -type d -name "$pattern" -exec cp -a {} /profiler-node-modules/.pnpm/ \;; \
  done; \
  pyroscope_dir="$(basename "$(find /profiler-node-modules/.pnpm -maxdepth 1 -type d -name '@pyroscope+nodejs@*' | head -n 1)")"; \
  pprof_dir="$(basename "$(find /profiler-node-modules/.pnpm -maxdepth 1 -type d -name '@datadog+pprof@*' | head -n 1)")"; \
  ln -s "../.pnpm/${pyroscope_dir}/node_modules/@pyroscope/nodejs" /profiler-node-modules/@pyroscope/nodejs; \
  ln -s "../.pnpm/${pprof_dir}/node_modules/@datadog/pprof" /profiler-node-modules/@datadog/pprof

FROM alpine:3.23 AS runner

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN apk add --no-cache libstdc++=15.2.0-r2 \
  && addgroup -S node \
  && adduser -S -G node node

COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=profiler-deps --chown=node:node /profiler-node-modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node --input-type=module -e "const response = await fetch('http://localhost:3000/'); if (!response.ok) process.exit(1)"

USER node

CMD ["node", "apps/web/server.js"]
