# AutoOps Presentation Speaking Script

## Speaking split

| Speaker            | Slides    | Topic                                           |
|--------------------|-----------|--------------------------------------------------|
| Chetali Aggrawal   | Slides 1-3  | Introduction, project thesis, capability map   |
| Bhumika Burhade    | Slides 4-5  | Architecture, execution flow                   |
| Anas Khan          | Slides 6-9  | Product UI, onboarding, deployments, approvals |
| Anshuman Tiwari    | Slides 10-13 | Code quality, roadmap, demo, closing          |

---

## Handoff lines

- **Chetali → Bhumika:** "I'll now hand it over to Bhumika, who will explain the architecture and how the execution flow works."
- **Bhumika → Anas:** "Next, Anas will show how the product looks from the operator's point of view and how deployment management works."
- **Anas → Anshuman:** "I'll now pass it to Anshuman for code quality, our roadmap, and the closing."

---

## Chetali Aggrawal — Slides 1-3

### Slide 1 (Title)

Good morning/afternoon. We're presenting AutoOps — a self-hosted CI/CD platform MVP.

The goal of this project is to give teams a single control plane for GitHub-triggered pipelines, deployment operations, approvals, and rollback handling.

As you can see on the right, the dashboard is already functional. It tracks active runs, deployment health, approval queues, and execution history — all from one screen.

Our team built this with Express, React 19, a background worker, Postgres, and Docker-based execution — the tech tags you see at the bottom.

Let's start with what problem we're solving.

### Slide 2 (Project Thesis)

At a high level, AutoOps solves a common problem: CI/CD workflows are often spread across scripts, servers, and dashboards. Teams lose visibility into what's running, what failed, and how to recover.

AutoOps brings those pieces together into one system. It turns a GitHub push into a controlled, self-hosted workflow. It centralizes queueing, execution, deployment state, and recovery — so operators don't rely on fragmented scripts.

The core promise is simple: push code, track every stage, deploy safely, recover quickly.

Our primary users are platform teams, operators, and self-hosted product teams that need more control over their delivery pipeline.

### Slide 3 (Capability Map)

In Phase 1, the platform already covers the full delivery loop — this is not just a single slice of CI/CD.

We have six capabilities:
- GitHub Intake handles app installations, webhook validation, and repo syncing.
- Pipeline Config lets each repository define its own build and deploy settings.
- The Execution Engine queues runs, builds Docker images, runs tests, and deploys.
- The Operations UI gives operators a full dashboard with runs, deployments, approvals, and rollback actions.
- Recovery Controls handle deployment revisions, automatic rollback, and promotion approvals.
- And Managed Mode supports importing standalone web applications directly.

**Handoff:** "I'll now hand it over to Bhumika, who will explain the architecture and how the execution flow works."

---

## Bhumika Burhade — Slides 4-5

### Slide 4 (Architecture)

The architecture is divided into clear layers.

On the left, GitHub sends installations and push webhooks into our system. The apps/api package acts as the control plane — it handles authentication, project and deployment APIs, and repository analysis.

The packages/core module contains shared types, pipeline parsing, security helpers, and rollback logic. The apps/worker claims queued runs, clones repos, builds, tests, deploys, and handles rollback and promotion.

On the bottom row: apps/web is the React 19 operator dashboard, packages/db manages the Postgres schema with runs, targets, revisions, secrets, and audit logs, and deployment targets support SSH Compose hosts and managed VPS with healthcheck endpoints.

This clean separation makes the system easier to maintain and extend.

### Slide 5 (Execution Flow)

This slide shows the full execution flow — every push follows this exact sequence.

It starts with a Push Event: GitHub emits a signed webhook. The API validates headers and deduplicates the delivery. Then matching projects create queued runs with the branch and commit SHA.

The worker picks up the run, clones the repository, and resolves the pipeline config. It then runs the Docker image build and test commands in sequence. Finally, it pushes the image, deploys to the target, runs a healthcheck, and records the deployment revision.

Everything is persisted — runs, stages, logs, delivery outcomes, targets, revisions, and approvals all land in Postgres for full traceability.

The result is that the dashboard can immediately show what failed, where it failed, and what the next safe recovery action should be.

**Handoff:** "Next, Anas will show how the product looks from the operator's point of view and how deployment management works."

---

## Anas Khan — Slides 6-9

### Slide 6 (Overview Page)

This is the overview screen — the first thing an operator sees when they log in.

It's designed for triage. The top row shows the most important metrics: active runs, unhealthy targets, 7-day success rate, and pending approvals. Below that, the "Needs Attention" section highlights the latest failed run with a one-click rerun button.

On the right, the release approval queue shows pending promotions, and the live execution panel shows currently running deployments. At the bottom, the execution history table gives a quick view of recent runs across all projects.

Instead of digging through multiple tools, the operator gets an immediate picture of delivery health from this single page.

### Slide 7 (Repositories / Onboarding)

This repositories view supports onboarding — it's where AutoOps links source repositories to deployment paths.

The UI brings together OAuth connection, GitHub App installation sync, repository inventory, and import actions in one workflow. Teams can connect GitHub, inspect repositories, and decide whether a project should follow a managed deployment path or a custom pipeline path.

For Version 1, managed mode targets standalone Next.js, React, CRA, and static HTML repositories. Monorepos stay on the custom-pipeline route. This makes AutoOps flexible enough for different project types while keeping the workflow centralized.

### Slide 8 (Deployment Safety)

This deployment view is one of the strongest parts of the platform — and it's where AutoOps shows operational maturity.

Each target carries its environment, protection status, promotion order, healthcheck URL, and deployment metadata. When a release succeeds, it becomes a deployment revision with image references and digests — which makes rollback explicit rather than guesswork.

The key point here is: if deployment health fails after a known-good revision exists, the worker can attempt automatic rollback. Deployment history is tied directly to recovery options.

You can also see the revision ledger and inspector panels, which let operators drill into exactly what was deployed, when, and what went wrong.

### Slide 9 (Approvals / Governance)

This slide focuses on governance and traceability.

AutoOps supports protected release approvals — so important promotions can require an explicit decision before deployment work is queued. For example, promoting from staging to production requires someone to approve it first.

Each approval record stores the requester, revision, source target, destination target, comments, and decision timestamps. This creates a proper audit trail.

The bottom section shows recent decisions, so there's always a traceable history of who approved what and when. Operators get a durable change trail instead of relying on memory or side-channel approvals.

**Handoff:** "I'll now pass it to Anshuman for code quality, our roadmap, and the closing."

---

## Anshuman Tiwari — Slides 10-13

### Slide 10 (Code Quality)

Before we look ahead, let's talk about engineering discipline — because an MVP is only credible if it's well-tested.

We have 17 test suites passing across all five packages, with 68 individual test cases. These cover webhook validation, pipeline parsing, deployment rollback, run streaming, and UI rendering.

There are 26 test files living alongside 52 source modules — about 14,400 lines of TypeScript. Every package has its own tests: apps/api, apps/web, apps/worker, packages/core, and packages/db.

The monorepo uses pnpm workspaces, so shared packages ensure type safety between the API, worker, and dashboard without code duplication. We use Vitest and Testing Library for fast unit and integration tests, including DOM testing for the React dashboard.

### Slide 11 (Phase 2 Roadmap)

Looking ahead, here's what Phase 2 builds on top of the current foundation — without requiring a rearchitecture.

- Multi-environment promotion will formalize staging-to-production chains with environment-specific configs and approval gates.
- Kubernetes targets will let us deploy to k8s clusters alongside existing Docker Compose and VPS targets.
- Role-based access control will add team-scoped permissions for projects, approvals, and deployment targets.
- Deeper observability means build time trends, deploy frequency tracking, and integration with tools like Grafana or Prometheus.
- We're also planning broader framework support — monorepo detection, Rust, Go, and Python pipelines.
- And finally, an audit and compliance log for an immutable record of every deployment decision.

### Slide 12 (Live Demo)

At this point we'd like to show you AutoOps in action.

The demo follows the exact flow we described earlier: we'll push code to main, watch the webhook trigger a pipeline run, see the build and test stages execute, watch the deployment go out, observe the healthcheck, and — if we have time — trigger a rollback to show recovery in action.

[SWITCH TO LIVE DEMO]

### Slide 13 (Closing)

To wrap up — AutoOps already covers the full CI/CD lifecycle: webhook intake, build, test, deploy, healthcheck, and rollback.

It's an operator-first dashboard with triage, approval gates, and recovery actions — not just a deployment log.

And the clean monorepo architecture means it's ready to extend with new deployment targets, frameworks, and observability tools.

Thank you for your time. We'd be happy to answer any questions.
