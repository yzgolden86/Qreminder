FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY packages/server-ts ./packages/server-ts
COPY runtimes/node ./runtimes/node
RUN pnpm install --frozen-lockfile

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app /app
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@renewlet/runtime-node", "start"]
