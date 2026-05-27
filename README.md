# Balance

Balance is a platform for converting transaction documents into structured records. It handles receipts, invoices, and proofs of purchase, covering use cases such as personal receipt records, spend insights, budgets, reimbursements, claims, approvals, and document review.

## What Balance is about

Transaction documents are commonly spread across email inboxes, downloads folders, chat threads, cloud drives, and physical paper. That distribution makes them difficult to search, difficult to verify, and prone to being unavailable when they are actually needed.

The platform is built around four core principles:

- keep the original document
- convert it into a structured record
- make that record usable across personal and team workflows
- retain enough context for review, correction, budgeting, and accountability

The goal is a document workflow, not just a storage layer.

## Who it is for

Balance is designed for individuals and teams.

### Individuals

- tracking receipts and proofs of purchase
- uploading one document at a time for extraction and correction
- organizing records by label, category, record type, tags, and notes
- reviewing personal transaction history through dashboard and insights views
- setting current-month category budgets against captured document spend
- retrieving old records when needed for tax, warranty, return, personal, or reimbursement purposes

### Teams and organizations

- reviewing submitted documents consistently
- verifying extracted details before processing
- recording status, notes, review outcomes, and audit history
- using claims as reviewer decision case files rather than simple document duplicates
- managing organization members, roles, and member password resets
- auditing what was submitted, checked, approved, rejected, changed, or deleted

## How Balance works at a high level

Balance is implemented as a single platform with role-aware views over a shared document lifecycle. A document moves from upload, to extraction, to structured document information, to optional enterprise claim review without losing its link to the original source.

Consumer views focus on personal records, spend insights, and budgets. Enterprise views focus on document intake, claim decisions, review queues, members, and audit governance. The shared lifecycle across those stages is the core architectural intent.

## Current repository state

The repository is an early, deployable foundation. It is not a complete product.

Today it includes:

- a web shell for the main browser experience
- a public landing page, login, registration, consumer routes, enterprise routes, admin routes, and settings routes
- an API with health, readiness, version, authentication, account, document, budget, claim, review, enterprise member, and audit endpoints
- PostgreSQL, Redis, and worker services for the backend document workflow
- a desktop shell reflecting the multi-surface product direction
- shared packages for database schema, request schemas, types, configuration, UI components, and runtime helpers
- Docker and Compose assets for local, staging, and production environments
- CI and deployment workflows for build, verification, packaging, deployment, rollback, and smoke checks

The scope is intentional. The focus at this stage is establishing product shape, project structure, runtime wiring, deployment path, and the backend document workflow required before the richer user experience is built out further.

## Current capabilities

- public web routes at `/`, `/login`, `/register`, and role-aware app routes
- consumer routes for dashboard, documents, insights, budget, and settings
- enterprise routes for documents, claims, review queue, members, audit log, and settings
- API endpoints for `/health`, `/ready`, `/version`, authentication, account updates, document upload, metadata updates, correction, extraction retry, budgets, claim submission, review decisions, enterprise members, and audit retrieval
- proxy-friendly web-to-API routing through `/api/*`
- required document label and category metadata, with shared category taxonomy across upload, insights, and budgets
- consumer budget CRUD with current-month spend calculations from document records
- PDF and image document preview support, including PDF page controls in the web document preview
- role-aware document detail views with consumer claim UI removed and enterprise claim/review affordances preserved
- enterprise claim detail pages structured around reviewer decisions, evidence summary, timeline, and audit trail
- local PostgreSQL, Redis, and worker services for backend workflow validation
- a desktop shell with a secure preload bridge
- local, staging, and production container definitions
- automated lint, typecheck, test, build, Compose config, and smoke-check support

## Observability

Balance includes an observability layer to support service health checks, host resource visibility, and container runtime visibility without changing the public web and API access model.

Audit visibility is also part of the application model. Organization-scoped audit events are used by enterprise audit log and audit summary views so administrators can review the same event universe across table and metric surfaces.

## Architecture at a glance

Balance is currently structured as a pnpm monorepo:

- `apps/web` for the web application
- `apps/api` for the API
- `apps/desktop` for the desktop application
- `packages/db` for Prisma schema, migrations, generated client, and seed support
- `packages/schemas` for shared request validation schemas
- `packages/types` for shared enums and TypeScript contracts
- `packages/config`, `packages/ui`, and `packages/utils` for shared building blocks

## Local development

Use Node `24.15.0` and pnpm `10.33.1`.

For normal local startup, run the user-facing helper from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\dev.ps1
```

`dev.ps1` preserves persistent local data, prepares Prisma, and starts the full local Docker Compose stack. It is a convenience startup command, not a replacement for running validation commands individually.

Note: if you already have a local PostgreSQL service using port `5432`, the Docker Compose local stack publishes PostgreSQL on `localhost:5433` instead.

```bash
corepack enable
corepack prepare pnpm@10.33.1 --activate
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Backend document and review workflow tests require PostgreSQL and Redis. Use Docker Compose for the local services, then run Prisma migrations and seed either from an API container or from a shell with a reachable `DATABASE_URL`.

```bash
docker compose -f infra/compose/compose.local.yml up -d --build postgres redis
docker compose -f infra/compose/compose.local.yml run --rm api pnpm prisma:deploy
docker compose -f infra/compose/compose.local.yml run --rm api pnpm prisma:seed
```

To start the full local stack, run:

```bash
docker compose -f infra/compose/compose.local.yml up -d --build
```

The web app still reaches the API through `/api/*`.

Useful local routes:

- `http://localhost:3000/`
- `http://localhost:3000/login`
- `http://localhost:3000/register`
- `http://localhost:3000/app`
- `http://localhost:3000/app/documents`
- `http://localhost:3000/app/insights`
- `http://localhost:3000/app/budget`
- `http://localhost:3000/enterprise/documents`
- `http://localhost:3000/enterprise/claims`
- `http://localhost:3000/api/health`
- `http://localhost:3000/api/ready`
- `http://localhost:3000/api/version`

## Direction

The longer-term direction is a fuller document-to-record workflow platform covering richer document intake, structured extraction, spend insight, budget tracking, review flows, audit history, and role-aware experiences over shared underlying records.

This repository is the starting point.
