# Balance

Balance turns transaction documents into useful records. It helps people and teams keep receipts, invoices, and proofs of purchase organized, searchable, reviewable, and ready for budgeting, reimbursement, claims, approvals, and audit history.

## What Balance Is About

Transaction documents are commonly spread across email inboxes, downloads folders, chat threads, cloud drives, and physical paper. That distribution makes them difficult to search, difficult to verify, and prone to being unavailable when they are actually needed.

The platform is built around four core principles:

- keep the original document attached to the record
- extract the important transaction details
- make the record useful across personal and team workflows
- preserve enough context for correction, review, budgeting, and accountability

The goal is a document workflow, not just a storage layer.

## Who It Is For

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
- using claims as reviewer decision records rather than simple document duplicates
- managing organization members, roles, and member password resets
- auditing what was submitted, checked, approved, rejected, changed, or deleted

## How Balance Works

Balance is implemented as a single platform with role-aware views over a shared document lifecycle. A document moves from upload, to extraction, to structured document information, to optional enterprise claim review without losing its link to the original source.

Consumer views focus on personal records, spend insights, and budgets. Enterprise views focus on document intake, claim decisions, review queues, members, and audit governance. The shared lifecycle across those stages is the core architectural intent.

## Current Repository State

The repository is a v0.6 foundation for the Balance product. It has real application surfaces, backend workflow wiring, local observability, and security-oriented verification, but it is still not a complete production product.

Today it includes:

- a web shell for the main browser experience
- a public landing page, login, registration, consumer routes, enterprise routes, admin routes, and settings routes
- an API with health, readiness, version, authentication, account, document, budget, claim, review, enterprise member, and audit endpoints
- local authentication, session handling, role-aware authorization, upload checks, and audit events
- PostgreSQL, Redis, and worker services for the backend document workflow
- a desktop shell that reflects the multi-surface product direction
- shared packages for database schema, request schemas, types, configuration, UI components, and runtime helpers
- Docker and Compose assets for the local app, local observability, CI proof, and profile-gated access templates
- CI and local verification support for lint, typecheck, tests, build, Compose config, scans, and smoke checks

The scope is intentional. The focus at this stage is product shape, project structure, secure local workflow, runtime wiring, and the backend document workflow required before the richer user experience is built out further.

## Current Capabilities

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
- local app, observability, CI proof, and profile-gated access container definitions
- automated lint, typecheck, test, build, Compose config, and smoke support

## Tech Stack

Balance is organized as a pnpm monorepo with separate apps, shared packages, and a worker service.

- Web app: Next.js 16, React 19, Tailwind CSS 4, Radix UI, Recharts, PDF.js, React PDF, lucide icons, and Sonner notifications.
- API: NestJS 11, TypeScript, Prisma 7, PostgreSQL, CASL authorization, Zod validation, Helmet, Pino logging, BullMQ, Redis, and Argon2 password hashing.
- Worker and document processing: Python, FastAPI, BullMQ, Redis, PaddleOCR, Tesseract, PyMuPDF, pypdf, pdfplumber, Pillow, and pydantic-settings.
- Desktop shell: Electron, React, Vite, and a secure preload bridge.
- Observability: Prometheus, Grafana, Loki, Tempo, Alloy, Pyroscope, Gatus, Alertmanager, ntfy, and OpenTelemetry.
- Local platform: Docker Compose, PostgreSQL, Redis, Caddy and Authelia profile templates, pnpm, Turborepo, Vitest, ESLint, and Prisma tooling.
- Security checks: Gitleaks, OSV Scanner, Trivy, Semgrep, Hadolint, and targeted auth, authz, and upload verification scripts.

## Observability

Balance includes a local-first observability layer for developer operations and a separate public-safe status surface for users.

The developer stack runs from the default local Compose profile and keeps its operational tools private by default:

- Grafana dashboards at `http://127.0.0.1:3002`
- Prometheus metrics at `http://127.0.0.1:9090`
- Alertmanager at `http://127.0.0.1:9093`
- Loki logs at `http://127.0.0.1:3100`
- Tempo traces at `http://127.0.0.1:3200`
- Pyroscope profiles at `http://127.0.0.1:4040`
- ntfy alert delivery at `http://127.0.0.1:8081`

The user-facing status surface is served by Gatus at `http://127.0.0.1:8080` locally. A production-profile Caddy template routes `status.${BALANCE_BASE_DOMAIN}` to Gatus and keeps developer observability behind private access controls. The production profile is configuration proof only; it is not a deployment, DNS change, certificate issuance, or public exposure step.

The default observability stack does not require AWS, EC2 monitoring, S3, Textract, Docker socket access, privileged containers, or broad host filesystem mounts. The optional `observe-deep` profile currently includes only an isolated `node-exporter`; cAdvisor is intentionally not enabled without explicit approval for local host/container access risk.

Audit visibility is also part of the application model. Organization-scoped audit events are used by enterprise audit log and audit summary views so administrators can review the same event universe across table and metric surfaces.

## Repository Layout

The public repository is laid out around the product surfaces and shared platform pieces:

```text
.
|-- .github/
|   `-- workflows/              # CI and verification workflows
|-- apps/
|   |-- web/                     # Next.js browser app
|   |-- api/                     # NestJS API service
|   `-- desktop/                 # Electron desktop shell
|-- packages/
|   |-- db/                      # Prisma schema, migrations, seed, and generated client
|   |-- schemas/                 # Shared request and payload validation
|   |-- types/                   # Shared TypeScript contracts
|   |-- config/                  # Shared runtime configuration helpers
|   |-- ui/                      # Shared UI building blocks
|   `-- utils/                   # Shared utility helpers
|-- services/
|   `-- worker/                  # OCR and document-processing worker
|-- infra/
|   |-- compose/                 # Local and CI Compose definitions
|   |-- observability/           # Metrics, dashboards, logs, traces, and status configuration
|   |-- caddy/                   # Local/profile-gated routing templates
|   `-- authelia/                # Local/profile-gated access-control templates
|-- scripts/
|   |-- security/                # Local security scan wrappers
|   `-- verify/                  # Local proof and smoke-check wrappers
|-- legacy/
|   `-- aws/                     # Historical AWS-era assets, not the active default path
|-- package.json                 # Root scripts and workspace metadata
|-- pnpm-workspace.yaml          # Monorepo workspace definition
|-- prisma.config.ts             # Prisma configuration
`-- version.json                 # Current app version metadata
```

## How The Pieces Fit Together

- The web app presents consumer, enterprise, admin, auth, and status-facing routes.
- The API owns authentication, account changes, uploads, document records, budgets, claims, reviews, members, and audit retrieval.
- PostgreSQL stores the durable application data, while Redis supports queue and workflow state.
- The worker handles document-processing jobs and extraction flow.
- Shared packages keep database, validation, type, UI, config, and utility contracts consistent across apps.
- Local Compose wiring starts the app, backend services, worker, observability tools, and optional access-control templates together for development and proof.

## Local Development

Use Node `24.15.0` and pnpm `10.33.1`.

For normal local startup, run the user-facing helper from the repository root:

```powershell
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File .\dev.ps1
```

`dev.ps1` preserves persistent local data, prepares Prisma, starts the full local Docker Compose app plus observability stack, waits for readiness, and prints local URLs. It may stop Balance local Compose containers and safe process owners on required local ports after printing process details, but it does not remove volumes or reset local data. It is a convenience startup command, not a replacement for running validation commands individually.

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

Local observability verification wrappers are non-destructive and expect the relevant stack to be running unless `BALANCE_VERIFY_LIVE=0` is set for static/config-only checks:

```bash
bash scripts/verify/observability.sh
bash scripts/verify/status.sh
bash scripts/verify/telemetry.sh
bash scripts/verify/dashboards.sh
```

Security scan wrappers are also non-installing local gates. Install [Gitleaks](https://github.com/gitleaks/gitleaks), [OSV-Scanner](https://google.github.io/osv-scanner/), [Trivy](https://trivy.dev/latest/docs/), [Semgrep](https://semgrep.dev/docs/), and [Hadolint](https://github.com/hadolint/hadolint) from their official project documentation, then run:

```bash
bash scripts/security/scans.sh
```

The aggregate wrapper runs each scanner and reports each tool's own failure separately before returning a non-zero exit when any required scan fails.

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
- `http://127.0.0.1:8080/`
- `http://127.0.0.1:3002/`
- `http://127.0.0.1:9090/`
- `http://127.0.0.1:9093/`
- `http://127.0.0.1:3100/`
- `http://127.0.0.1:3200/`
- `http://127.0.0.1:4040/`
- `http://127.0.0.1:8081/`

## Direction

The longer-term direction is a fuller document-to-record workflow platform covering richer document intake, structured extraction, spend insight, budget tracking, review flows, audit history, and role-aware experiences over shared underlying records.

This repository is the starting point.
