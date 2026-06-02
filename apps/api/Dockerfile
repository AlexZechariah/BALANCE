FROM node:24.15.0-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.33.1 --activate

WORKDIR /workspace

FROM base AS build

COPY . .

RUN pnpm install --frozen-lockfile
ENV DATABASE_URL=postgresql://balance:balance@postgres:5432/balance?schema=public
RUN pnpm prisma:generate
RUN pnpm exec turbo run build --filter=@balance/api
RUN pnpm --filter @balance/api --prod deploy --legacy /runtime/api

FROM alpine:3.23 AS runner

ENV NODE_ENV=production

WORKDIR /app

RUN apk add --no-cache libstdc++=15.2.0-r2 \
  && addgroup -S node \
  && adduser -S -G node node

COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY --from=build --chown=node:node /runtime/api/package.json ./package.json
COPY --from=build --chown=node:node /runtime/api/dist ./dist
COPY --from=build --chown=node:node /runtime/api/node_modules ./node_modules

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node --input-type=module -e "const response = await fetch('http://localhost:3001/health'); if (!response.ok) process.exit(1)"

USER node

CMD ["node", "dist/main.js"]
