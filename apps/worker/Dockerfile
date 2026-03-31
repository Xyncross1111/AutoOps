FROM node:21-bookworm-slim AS base
RUN apt-get update && apt-get install -y git openssh-client docker.io && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/db/package.json ./packages/db/package.json
RUN corepack enable && pnpm install --filter @autoops/worker... --frozen-lockfile=false

COPY apps/worker ./apps/worker
COPY packages/core ./packages/core
COPY packages/db ./packages/db

RUN pnpm --filter @autoops/worker build

CMD ["pnpm", "--filter", "@autoops/worker", "dev"]

