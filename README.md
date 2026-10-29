# Asset Migration Studio

An agentic workspace for moving asset data from IBM Maximo (and later SAP PM) into IFS Cloud. Agents analyse, map, transform and check the data through the Industrial Asset Ontology. People approve every decision that matters, and only tested code moves the data.

This repository is the **Phase 0 concept demo** described in `Asset_Migration_Studio_Product_Specification.docx`: a Maximo-to-IFS migration for a fictional water and power utility (Northvale Water & Power), with synthetic data shaped like a real Maximo extract.

## Run it locally

Requirements: Node.js 22+.

```bash
npm install
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:8791 (the web dev server proxies `/api` to it)

The Review Assistant uses Claude (`claude-opus-5-5` by default) when `ANTHROPIC_API_KEY` is set. Without a key, the assistant and all agent runs are **scripted**, which the UI labels. The spec allows scripted agent results in the concept demo as long as the presenter says so.

```bash
# optional: live Review Assistant
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Production build, served by one Node process on port 8791:

```bash
npm run build
npm start
```

## What to show in a demo

| Screen | Differentiator |
|---|---|
| Mission control | 14-stage pipeline, decisions waiting for people, live agent team |
| Discovery → Business rules | D4: priority rule found in the `NV_WOPRIORITY` automation script |
| Ontology alignment | D1, D5: source → ontology concept → IFS Cloud, with evidence and confidence |
| Review queue | D5, D2: risk-sorted queue, evidence, precedents, approve / reject / change, keyboard shortcuts (J/K, A, R, C, N) |
| Hierarchy | D1, D6: Maximo dual hierarchy rebuilt as IFS functional and serial objects; pumps under valves flagged |
| Validation | D6: semantic rule failures in plain language |
| Data quality | D9: score before and after, duplicate merges and other fix proposals |
| AI-ready view | D7: one asset as a Loops Digital Worker would receive it |
| Proof pack | D8: runs, reconciliation, lineage, approvals, hash-chained audit, sign-off |

Useful moves:

- Switch persona (top right) to see role-based permissions. Named (safety-critical or regulatory) items need a data expert, data owner or IFS consultant. Sign-off needs the customer data owner **and** the IFS consultant.
- Answer the open questions as Tom Hughes (data owner): the work-order status mapping is re-proposed by the Code List Agent.
- Approve fixes in Data quality, then **Start Run 3** in Mission control: validation failures drop and reconciliation improves.
- `Ctrl K` opens the command palette (go to a screen, run a stage, find a mapping, ask the agents). `.` toggles the agent panel.
- `POST /api/reset` restores the demo state.

## Architecture

```
server/   Express + TypeScript API
  src/data/       synthetic Maximo extract (deterministic), ontology slice, catalogue, mappings
  src/store.ts    project state, validation, data quality, runs, hash-chained audit log
  src/agents/     scripted orchestrator (stage runs streamed over SSE) and the Review Assistant
web/      React 19 + Vite + Tailwind v4
  src/shell/      sidebar, top bar, agent dock (live activity + Ask), command palette
  src/pages/      one file per screen
```

- Live agent activity and state changes stream to the browser over Server-Sent Events (`/api/stream`).
- The audit log is write-once and hash-chained (`/api/audit`), so any edit breaks verification.
- Text found inside source data is passed to the model as data inside `<project_data>`, never as instructions.
- IFS Cloud object names follow public material and are marked "to be confirmed with IFS", as the spec requires.

## Deploying to Azure

The app ships as one container (`Dockerfile`): the API serves the built web app. Deployment runs from Azure Cloud Shell (bash); no local Azure CLI or Docker is needed.

In Cloud Shell:

```bash
az account set --subscription "Microsoft Azure Sponsorship"
git clone https://github.com/swarupd227/Asset-Migration-Studio.git ~/Asset-Migration-Studio
cd ~/Asset-Migration-Studio
bash deploy/azure/deploy.sh          # registry, image build, Key Vault, Container Apps
bash deploy/azure/enable-signin.sh   # Entra ID sign-in for your tenant
```

To ship a new version, push to `main`, then in Cloud Shell run `git -C ~/Asset-Migration-Studio pull` and `bash deploy/azure/deploy.sh` again; it builds a new image tag and updates the app in place.

The demo keeps state in memory, so the app runs as exactly one always-on replica, and a restart resets the demo.

### Target architecture for the pilot

Suggested target, matching the spec's non-functional requirements:

| Need | Azure service |
|---|---|
| Run the container | Azure Container Apps (or App Service for Containers) |
| Secrets (Maximo credentials, Anthropic key) | Azure Key Vault, referenced as Container Apps secrets |
| Sign-in | Microsoft Entra ID (Container Apps built-in auth), Okta as an alternative |
| Model access | Claude through an enterprise endpoint with no training retention (Anthropic API or Microsoft Foundry) |
| Project state, audit log | Azure Database for PostgreSQL; audit in an append-only table or immutable Blob storage |
| Per-customer isolation and residency | One resource group per tenant, region chosen at project setup |
| Observability | Application Insights / Azure Monitor (trace every agent call with cost and time) |

The in-memory store in `server/src/store.ts` is the seam to replace with PostgreSQL when the pilot starts.
