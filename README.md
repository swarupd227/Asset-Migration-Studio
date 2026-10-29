# Asset Migration Studio

Asset Migration Studio moves asset management data from IBM Maximo (and, next, SAP Plant Maintenance) into IFS Cloud. Agents analyse, map, transform and check the data through the Industrial Asset Ontology; people approve the decisions that matter; tested transformations move the data through IFS migration tooling.

Module of Astra Data Factory.

## Local development

Requirements: Node.js 22+, Docker.

```bash
npm install
npm run db      # PostgreSQL 17 on localhost:5433 (docker compose)
npm run dev     # API on :8791, web app on :5173
```

Open http://localhost:5173. On first start the API creates the schema and loads the Northvale Water & Power project from its Maximo extract.

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://ams:ams@localhost:5433/ams` |
| `ANTHROPIC_API_KEY` | Enables the Review Assistant and model-based concept alignment | unset: assistant answers from project data; unknown fields go to expert review |
| `AMS_MODEL` | Model for agents and the assistant | `claude-opus-5-5` |
| `AMS_DECISION_MODEL` | Decision model when external models are on | `claude-haiku-5-5` |
| `AMS_WORKER` | `off` runs the API without a background worker | on |
| `AMS_WORKER_CONCURRENCY` | Jobs one worker runs at once (one per project) | `2` |
| `PORT` | API port | `8791` |
| `ALLOW_REFERENCE_RELOAD` | Allows `POST /api/admin/reload-reference` to reload the Northvale project | unset (disabled) |

```bash
npm run typecheck
npm test
npm run build && npm start   # production build served by the API
```

## Using the platform

- **Projects:** create a delivery project or a 30-day preview workspace (migration leads and sales engineers).
- **Sources:** upload CSV, Excel (.xlsx) or Parquet extracts, one file per table (`ASSET`, `LOCATIONS`, `WORKORDER`, `PM`) or one workbook with a sheet per table. Each column is profiled; non-standard columns are flagged as customer extensions.
- **Pipeline:** run discovery, profiling, alignment and target design from Mission control. Known fields are bound from the mapping memory; custom fields are bound by the Concept Aligner with evidence and a calibrated confidence.
- **Review queue:** riskiest and least confident first; approve, reject, change or mark not migrated. Keyboard: J/K, A, R, C, N, ?.
- **Data quality and validation:** findings are computed from the stored records; approved fixes and mappings are applied by the transformation before the next dry run.
- **Proof pack:** dry-run history, reconciliation, lineage, approvals and the audit chain; signed by the customer data owner and the IFS solution consultant.

`Ctrl K` opens the command palette; `.` toggles the agent panel.

## Architecture

```
server/   Express + TypeScript API, PostgreSQL
  src/db.ts          pool, schema, LISTEN/NOTIFY event fan-out
  src/store.ts       data access and derived project views
  src/rules.ts       rule catalogue, transformations, fix proposals, data quality, reconciliation
  src/extracts.ts    CSV parsing, column profiling, record loading
  src/agents/        orchestrator, Concept Aligner, Review Assistant
  src/decisions/     typed decisions: rules, decision model, reasoning model, people; trained in-environment model
  src/learning/      skill library, triggers, curator flow
  src/evals/         golden datasets and the release gate
  src/jobs.ts        background job queue and worker
  src/usage.ts       model call tracking, cost and budgets
  src/bootstrap.ts   schema, users and the Northvale reference project
web/      React 19 + Vite + Tailwind v4
```

- Every table is scoped by project; nested objects are JSONB next to the columns that are filtered on.
- The audit log is append-only (a trigger rejects UPDATE and DELETE) and hash-chained per project.
- Agent activity and change notifications go through PostgreSQL LISTEN/NOTIFY, so any replica can serve the live stream.
- Stage runs, decision batches and model training are jobs in PostgreSQL. Every replica's worker claims them with `FOR UPDATE SKIP LOCKED`; a project runs one job at a time, and a job whose replica stops is queued again.
- Every external model call is recorded with tokens, cost and latency by project, agent and stage. A project's monthly budget stops external calls once used; work continues on the in-environment model.
- The in-environment decision model learns from records people decided or the reasoning model confirmed. A trained version is used only when it gets at least 75% of held-out records right and does no worse than keyword evidence; guardrail questions are never trained.
- Source data is passed to the model inside `<project_data>` and treated as data, never as instructions.

## Deploying to Azure

Runs from Azure Cloud Shell (bash); no local Azure CLI or Docker needed.

```bash
az account set --subscription "Microsoft Azure Sponsorship"
git clone https://github.com/swarupd227/Asset-Migration-Studio.git ~/Asset-Migration-Studio
cd ~/Asset-Migration-Studio
bash deploy/azure/deploy.sh
```

`deploy.sh` creates or updates: Container Registry (image built in Azure), Key Vault (access policies), managed identity, Azure Database for PostgreSQL Flexible Server (B1ms), Log Analytics and the Container App (1–3 replicas). It is safe to re-run; to ship a new version, `git pull` and run it again.

## Backlog

- Microsoft Entra ID sign-in (`deploy/azure/enable-signin.sh`); until then users are selected in the account menu.
- PostgreSQL private networking (VNet integration) instead of the Azure-services firewall rule.
- Managed-identity image pulls once the deploying account can create role assignments.
- Source connectors (Maximo database read access, SAP) alongside extract upload; Parquet and Excel extracts.
