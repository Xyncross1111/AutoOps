# AutoOps

AutoOps is a self-hosted CI/CD platform MVP for GitHub repositories. Phase 1 includes:

- GitHub webhook intake and pipeline triggering
- Postgres-backed run queueing
- Docker-based build and test execution
- SSH-based Docker Compose deployments with automatic rollback
- A web dashboard for projects, runs, logs, and rollback actions

## Workspace Layout

- `apps/api`: control plane API and GitHub webhook intake
- `apps/worker`: queue processor, build/test runner, deployer
- `apps/web`: React dashboard
- `packages/core`: shared types, validation, security, and workflow helpers
- `packages/db`: Postgres schema and repository layer

## Quick Start

1. Copy `.env.example` to `.env` and fill in GitHub App credentials.
2. Install dependencies with `pnpm install`.
3. Start Postgres with `docker compose up postgres -d`.
4. Run the apps in separate terminals:
   - `pnpm dev:api`
   - `pnpm dev:worker`
   - `pnpm dev:web`

## Faster Builds

This workspace now uses Turborepo for `build`, `test`, and `typecheck`.

- `pnpm build` runs a dependency-aware task graph instead of a plain recursive loop
- repeat builds restore package outputs from `.turbo/cache`
- unchanged packages are skipped automatically

For shared cache hits in CI or across machines, you can enable Vercel Remote Cache:

1. `npx turbo login`
2. `npx turbo link`

After that, `pnpm build`, `pnpm test`, and `pnpm typecheck` can reuse cached artifacts across developers and CI jobs.

## Project Secrets

Project secrets are stored encrypted in Postgres. Phase 1 expects these secret names:

- `ghcr_username`
- `ghcr_token`
- `<hostRef>_host`
- `<hostRef>_user`
- `<hostRef>_private_key`
- `<hostRef>_port` (optional)

## Pipeline Config

Each connected repository must expose `.autoops/pipeline.yml`.

```yaml
version: 1
triggers:
  push:
    branches:
      - main
build:
  context: .
  dockerfile: Dockerfile
  image: ghcr.io/acme/sample-app
test:
  commands:
    - npm ci
    - npm test
deploy:
  targets:
    - name: production
      hostRef: prod
      composeFile: /srv/sample-app/docker-compose.yml
      service: app
      healthcheck:
        url: https://sample-app.example.com/health
```
