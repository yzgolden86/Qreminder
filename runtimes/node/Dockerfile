# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS builder
RUN corepack enable
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qreminder/client build

FROM node:22-alpine AS runner
RUN apk add --no-cache wget tini

RUN addgroup -S -g 1001 qreminder \
  && adduser -S -D -h /home/qreminder -u 1001 -G qreminder qreminder \
  && mkdir -p /data /home/qreminder \
  && chown -R qreminder:qreminder /data /home/qreminder

WORKDIR /app
COPY --from=builder --chown=qreminder:qreminder /app /app

USER qreminder

ENV HOME=/home/qreminder
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/qreminder.db
ENV ASSETS_DIR=/data/assets

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --spider --quiet "http://127.0.0.1:3000/api/setup-status" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--experimental-strip-types", "runtimes/node/src/index.ts"]
