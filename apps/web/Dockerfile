FROM node:21-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN corepack enable && pnpm install --filter @autoops/web... --frozen-lockfile=false
COPY apps/web ./apps/web
RUN pnpm --filter @autoops/web build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

