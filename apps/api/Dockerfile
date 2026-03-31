FROM node:21-bookworm-slim AS base
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/db/package.json ./packages/db/package.json
RUN corepack enable && pnpm install --filter @autoops/api... --frozen-lockfile=false

COPY apps/api ./apps/api
COPY packages/core ./packages/core
COPY packages/db ./packages/db

RUN pnpm --filter @autoops/api build

CMD ["pnpm", "--filter", "@autoops/api", "exec", "tsx", "src/index.ts"]
