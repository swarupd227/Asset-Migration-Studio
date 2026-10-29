# Asset Migration Studio – Development plan v2

Inputs: new specification (`Downloads/Asset_Migration_Studio_Product_Specification.docx`, dated 28 Oct 2026), previous specification (`IFS/Asset_Migration_Studio_Product_Specification.docx`, same date line), and the repository as it stands (server `server/src`, web `web/src`). Text diff: 718 → 906 extracted paragraphs; 12 paragraphs changed, two whole sections added, architecture diagram (`word/media/image1.png`) replaced. Functional requirement modules PC, DP, ON, MP, RV, TL, VR, ML, PV and AU are unchanged.

---

## 1. Spec changes (old → new)

**New sections**
- *Decision model layer* (new): fast "System One" model for high-volume typed decisions; 8 uses, 3 non-uses, 4-step decision flow, thresholds 0.85 / 0.60 with a 5% check sample, DM-01…DM-08, cost/time estimate, risks and controls, release plan.
- *Governed adaptive learning* (new): skill library modelled on Hermes Agent; example skills, skill contents, three learning loops, five drafting triggers, 7-step skill life cycle, rules skills cannot break, AL-01…AL-08, "Use of Hermes Agent".

**Changed sections**
- *Differentiators* D2 Mapping memory: now also "a governed skill library keeps the working procedures agents learn".
- *Architecture overview* table: Mapping memory row adds "skill library uses the same tenant and shared split"; new row **Decision model layer** (Jev from TypeSafe AI as first candidate; fallback Claude Haiku or a classifier trained on approved decisions).
- *Architecture diagram*: adds "Decision model (System 1)" under the mapping agents, a "Skill library" box beside ontology and memory, "Ontology Steward drafts new skills from corrections", evaluation harness now tests "agents, ontology and skills", review workbench approves "proposals and project skills".
- *Agents* table, Ontology Steward: job adds "drafts skills"; guardrail becomes "cannot publish ontology changes or shared skills".
- *End-to-end workflow* stage 14 Learn: steward sends "ontology and skill proposals" to the curator.
- *Mapping memory and data privacy*: new paragraph – skills are held separately from decisions, under the same privacy rules.
- *Quality measurement*: release rule now also gates the shared skill library.
- *Product data model*: Project gains `skill library version`; new entities **Model decision**, **Skill**, **Skill trigger**, **Skill use**.
- *Non-functional* Model use: bulk decisions go to a separate decision model. Scale: "row-level text goes only to the decision model". Repeatability: decision-model answers are cached and reused in reruns.
- *Release phases*: Phase 1 Pilot adds "project-level skills"; Phase 2 adds "shared skill library switched on".

**Unchanged but newly load-bearing**
- RV-01 (risk sort), ML-03 (precedents), DQ-01, SM-02, D7, D9 are now explicitly served by the decision model.

---

## 2. The two major changes

Provenance key: **[spec]** = stated in the new specification; **[ext]** = from outside sources (TypeSafe/DigitalOcean/DataCamp articles, Hermes Agent docs and reviews), not verified by us; **[plan]** = our design choice.

### 2.1 Decision model layer ("Jev System One model")

**What it is**
- [spec] Jev (TypeSafe AI, released 15 Sep 2026) does not generate text. Input: one record plus a set of typed questions. Output: one answer per question with calibrated confidence. Three question types: **Choice** (≤255 options), **Score** (rubric of 2–10 levels), **Yes/No probability**. Vendor figures: 70–500 ms latency, $0.042 per million input tokens, output free, 1,200 requests/min. Weak at arithmetic and dates. ~5–6 points below frontier models. Hosted only, waitlist, data location unconfirmed.
- [ext] TypeSafe frames LLMs as "System 2" (slow reasoning) and Jev as "System 1" (fast typed judgement). Output is guaranteed schema-valid; the answer itself is probabilistic and comes with no reason. Questions should be single, well-scoped judgements – split compound questions in your own code. Jev does not call tools. Launched with a $40M seed (DCVC). DigitalOcean lists Jev in its Model Catalog via Serverless Inference, which conflicts with the spec's "waitlist / hosted only" and is a possible second access route. Exact HTTP API, option/payload limits and rate limits are not published in what we found.

**What the spec requires** [spec]
- Model-neutral interface (DM-01), at least one fallback (DM-02), every decision stored with question, options, record key, probabilities, confidence, model + version, ontology version (DM-03), cache keyed on hash(input text, question, ontology version) (DM-04), dedupe identical texts (DM-05), send only needed fields and mask names of people/customers/sites (DM-06), per-project switch-off or in-environment model (DM-07), report share settled per step, cost and time (DM-08).
- Flow per bulk decision: **rules → decision model (≥0.85 auto-accept) → Claude reviews the middle band and explains → person reviews <0.60 and every model/Claude disagreement**; 5% of auto-accepts re-checked by Claude.
- Uses: failure mode + cause tagging of work order text (D7); two-step class inference for untyped assets (family, then class, because packs exceed 255 classes) (D9); duplicate-pair yes/no (DQ-01); long code lists (Code List Agent); failure-cause plausibility score (SM-02); prompt-injection screen on every free-text field (guardrails); review-queue risk score (RV-01); precedent relevance score (ML-03).
- Non-uses: concept binding, code reading, target design, code generation (stay with Claude); numeric/date/sequence checks (stay deterministic).
- Release plan: first use is failure-mode tagging on work orders; everything else after the golden-dataset gate; if Jev fails the gate the fallback replaces it with no product change.

**Mapping onto the current architecture**
- Today all row-level judgement is hard-coded in `server/src/rules.ts`: `inferConcept()` (regex over descriptions) for DQ-02 classification, a literal `TAPCHG` check for SM-02, exact-key grouping for DQ-01, a fixed confidence ladder in `proposeFixes()`. Code-list mapping exists only as the static `woStatusCodeList` in `data/ontology.ts`. Review sort is `riskRank` + confidence in `web/src/pages/Review.tsx`.
- `rules.ts` is pure and deterministic by design ("any replica computes the same answer"). The decision layer must keep that: decisions are computed by a job, persisted, and then passed into `transform()/validate()/proposeFixes()` as an extra input. Replicas read the cache, they never call the model on a request path.
- Claude is already wired (`agents/aligner.ts` structured output; `agents/assistant.ts` streaming; offline fallback when no key). The middle-band "reasoning model" step reuses the aligner's structured-output call pattern.
- Audit log is per action and hash-chained; per-decision rows would flood it. Plan: one audit entry per decision batch (model, version, ontology version, count, SHA-256 of the batch's decision ids), individual rows in a new `model_decisions` table [plan].

**What is new**: the whole layer – interface, adapters, flow engine, cache table, masking, question catalogue, decision review UI, stats. Also a prerequisite: closed work-order history is **not stored** today (dashboard adds a literal `15020` for the reference project in `store.ts dashboard()`), so there is no row-level text to tag beyond 400 open work orders.

### 2.2 Governed adaptive learning ("Hermes Agent")

**What it is**
- [spec] Agents write down *how* to do the work as **skills** (order of steps, checks, known traps), distinct from the mapping memory (*what* was decided). Skills are versioned files in the open **Agent Skills** format with: name, description, applicability conditions (source system, version, industry pack, object), steps/checks, worked examples + precedent links, scope (project | shared), owner, status, version, measured effect. Three loops: within a run (reviewer change, = RV-03), within a project (pattern repeats, data subject expert approves), across projects (curator, after anonymisation and golden-dataset pass). Triggers: ≥5 same-kind reviewer corrections; ≥5 IFS rejections for the same reason; recovery from an error by a new path; a successful long chain (≥10 tool calls); confidence drifting from reviewer outcomes. Life cycle: Draft → Project approved → Measured → Proposed for sharing → Tested → Published → Retired. Skills can never change guardrails, permissions, safety/regulatory rules or the ontology; only the curator publishes shared skills; projects pin a shared library version; project skills stay in tenant; in-project threshold tuning stays inside curator limits. The product borrows the pattern and format but does **not** run on Hermes.
- [ext] Hermes Agent (Nous Research, MIT, Feb 2026) is a general personal agent whose "closed learning loop" creates a skill file after a multi-step task, refines skills during use when a failed step later succeeds, and keeps agent-curated memory plus cross-session search. Skills follow the agentskills.io standard (a folder with `SKILL.md`: YAML front matter `name`, `description`, then Markdown instructions; optional scripts/resources), which Claude also loads. Reviews note Hermes lacks RBAC, signed skill governance and enterprise audit – exactly the gates this spec adds.

**Mapping onto the current architecture**
- Closest existing pieces: `ontology_proposals` table + curator-only `POST /api/ontology/proposals/:id` (governance pattern to copy); `tenantPrecedents()` in `agents/aligner.ts` (cross-project lookup within the deployment); `agent_events` (tool-call chains, for the long-chain trigger); `load_runs.data.errors` (IFS rejection trigger); audit `mapping.change/reject` entries (correction trigger); stage 14 in `agents/orchestrator.ts` (steward step, currently static text).
- Most agents are deterministic code, not prompts. A prose skill only changes behaviour where an LLM reads it (Concept Aligner, Review Assistant, Ontology Steward, the middle-band reasoner). For deterministic agents (hierarchy, code list, remediation, loader) a skill needs a **machine-readable effect** from a whitelist [plan] – e.g. `location_type_rule`, `pre_mapping_check`, `load_precheck`, `threshold_adjust` – which also makes "cannot change guardrails/ontology" enforceable by schema.

**What is new**: skill storage + library versions, trigger detection, steward drafting, approval flow, skill loading and use logging in every agent call, effect measurement, Skills UI, skill indicators in the review workbench, shared library publishing behind the eval gate.

---

## 3. Gap analysis

| Requirement | Status | Repo files |
|---|---|---|
| DM-01 model-neutral interface | Missing | new `server/src/decisions/*` |
| DM-02 fallback model | Missing (Claude client exists) | `agents/aligner.ts` pattern |
| DM-03 decision record | Missing | `db.ts` schema |
| DM-04 cache / rerun reuse | Missing | `db.ts`, `store.ts projectState()` |
| DM-05 dedupe repeated text | Missing | – |
| DM-06 field minimisation + masking | Missing (aligner already sends only profile stats) | `agents/aligner.ts`, `assistant.ts contextBlock()` |
| DM-07 switch-off / in-environment model | Missing | `projects` table, `bootstrap.ts createProject()`, `NewProject.tsx` |
| DM-08 share per step, cost, time | Missing | – |
| 4-step flow, 0.85/0.60, 5% check | Missing | – |
| Failure-mode/cause tagging (D7) | Missing; AI-ready shows class failure vocabulary + raw `failurecode` counts only | `store.ts aiReadyAsset()`, `AiReady.tsx` |
| Closed WO history as records | Missing (count faked in `dashboard()`) | `data/seed.ts workOrderStats`, `store.ts`, `extracts.ts` |
| Two-step class inference (D9) | Partial: regex `inferConcept()` | `rules.ts`, `proposeFixes()` |
| Duplicate yes/no (DQ-01) | Partial: exact key match, fixed confidences | `rules.ts validate()/proposeFixes()` |
| Code-list mapping of long lists | Partial: static WO status list; local codes (NV-HOLD, FLDCOMP, PEND-REG) handled as questions | `data/ontology.ts`, `bootstrap.ts` questions |
| SM-02 plausibility score | Partial: one hard-coded cause | `rules.ts` |
| Injection screen on free text | Partial: `<project_data>` wrapping + system prompt rule only | `agents/assistant.ts`, `agents/aligner.ts` |
| RV-01 risk score | Partial: static `risk` field | `Review.tsx byRiskThenConfidence` |
| ML-03 precedent relevance | Partial: precedents shown unscored | `aligner.ts tenantPrecedents()`, `Memory.tsx` |
| Model decision entity | Missing | `types.ts`, `db.ts` |
| AL-01 skills as versioned Agent Skills files | Missing | – |
| AL-02 steward drafts on trigger | Missing (steward is scripted text in stage 14) | `agents/orchestrator.ts` |
| AL-03 expert approval of project skills | Missing | `index.ts` role checks pattern |
| AL-04 skills logged per agent call | Missing | `store.ts audit()`, `emitAgent()` |
| AL-05 measured effect (acceptance, review time, load errors) | Missing; review time not captured at all | `index.ts decide()`, `load_runs` |
| AL-06 shared publish gate | Missing | `ontology_proposals` pattern |
| AL-07 pinned shared library version | Missing | `projects` table |
| AL-08 skill shown on proposal, rejectable | Missing | `Review.tsx` |
| Project.skill_library_version, Skill, Skill trigger, Skill use | Missing | `db.ts`, `types.ts` |
| Steward guardrail "cannot publish shared skills" | Text only | `store.ts agents[]` |
| Eval harness gating agents, ontology, **skills**, decision model | Missing: Agents & evals page shows constants | `web/src/pages/Agents.tsx` |
| Stage 14 Learn incl. skill proposals | Partial (static) | `orchestrator.ts` |
| NFR scale: row text only to decision model | Partial (Claude sees samples only; no decision model) | – |
| NFR observability: cost/time per stage | Missing | `index.ts` request logging only |
| Architecture diagram components (System 1 box, skill library) | Missing in UI | `Agents.tsx`, `Memory.tsx` |

---

## 4. Development plan

Ordering: feature work first (A–E), platform work after (F). Each phase ships behind no flag: the layer works with whatever model is configured, as the aligner already does.

### Phase A – Decision layer core and failure-mode tagging (L)

**Scope**: DM-01…DM-06, DM-08, the 4-step flow, one live use (failure mode + cause on work orders), visible in AI-ready view and a new Decisions screen.

**Data**
- `server/src/data/seed.ts`: generate the 8,068 in-scope closed work orders (BR-01) as records (`kind 'workorder'`, `status` CLOSE/COMP) with realistic, partly repeating free-text descriptions and long text, a share without `failurecode`, some technician names in text (to exercise masking), and one record containing instruction-like text (screen test). Older history stays summarised. Remove the `+ 15020` literal in `store.ts dashboard()`; count records.
- `extracts.ts`: accept `LONGDESCRIPTION` on WORKORDER; keep closed WOs on upload.
- `db.ts` new tables:
  - `model_decisions (project_id, id, question_id, record_kind, record_key, input_hash, options JSONB, answer TEXT, probabilities JSONB, confidence REAL, step TEXT CHECK (step IN ('rule','model','reasoning','human')), model TEXT, model_version TEXT, ontology_version TEXT, explanation TEXT, status TEXT, decided_by TEXT, created_at)`; PK `(project_id, id)`; index `(project_id, question_id, record_key)`.
  - `decision_cache (input_hash, question_id, ontology_version, model, answer, probabilities, confidence, created_at, PRIMARY KEY (input_hash, question_id, ontology_version, model))` – tenant-scoped by adding `project_id` to the key (no cross-tenant reuse).
  - `decision_batches (project_id, id, question_id, started_at, finished_at, counts JSONB, tokens INT, cost_usd NUMERIC, model, model_version)`.
  - `projects`: `decision_model TEXT NOT NULL DEFAULT 'fallback'`, `decision_thresholds JSONB` (defaults `{auto:0.85, human:0.60, sample:0.05}`).
- `types.ts`: `DecisionQuestion`, `ModelDecision`, `DecisionStep`, `DecisionStats`.

**Server modules (new `server/src/decisions/`)**
- `model.ts` – `interface DecisionModel { name; version; decide(records: MaskedRecord[], questions: TypedQuestion[]): Promise<Answer[]> }`, question types `choice | score | yesno` with Jev limits (≤255 options, 2–10 levels) enforced at definition time.
- `adapters/jev.ts` – HTTP adapter (env `JEV_API_URL`, `JEV_API_KEY` from Key Vault), batching, 1,200 rpm limiter, retries; built against TypeSafe docs once access is granted (Phase F).
- `adapters/claude.ts` – fallback: Claude Haiku with JSON-schema structured output, one call per batch of ~50 deduped texts; model from `AMS_DECISION_MODEL`; asks for per-option probabilities.
- `adapters/local.ts` – in-environment option: ontology synonym/keyword classifier (moves `inferConcept()` logic here), always available, used when no key or `decision_model='local'`.
- `mask.ts` – keep only the fields each question declares; replace people (users table + capitalised-name patterns in text), customer and site names with tokens.
- `flow.ts` – rules → model → reasoning (Claude via aligner-style call, gives answer + explanation) → human; thresholds from project; disagreement → human; deterministic 5% sample (hash of record key) → reasoning check; writes `model_decisions` + one batch audit entry.
- `questions.ts` – `wo.failure_mode` (Choice over the asset class's failure modes from `data/ontology.ts`, plus "none/unclear"), `wo.failure_cause` (Choice over causes valid for that mode).
- `jobs.ts` – runs a question over all records with dedupe (DM-05: group by normalised text hash) and cache lookup (DM-04); progress as agent events.

**Wiring**
- `agents/orchestrator.ts`: stage 8 (Build) adds a "Tag work history" step (agent id `decision-model`, shown as "Decision model") before transformation; reruns hit the cache and say so.
- `store.ts`: `getDecisions(pid, question)`, `decisionStats(pid)`; `aiReadyAsset()` adds tagged failure modes/causes per asset with counts and confidence; `projectState()` loads accepted decisions and passes them into `transform()` (tags written to IFS work order fields).
- `store.ts agents[]`: add decision-model entry; Steward job/guardrail text updated to the new spec wording.
- API (`index.ts`, project router): `GET /decisions/stats`, `GET /decisions?question=&step=&status=`, `POST /decisions/:id` (accept/override, data subject expert, reason required on override), `POST /decisions/run` (migration lead, per question).

**UI**
- New `web/src/pages/Decisions.tsx` (nav group *Decide*, "Bulk decisions"): funnel of share settled by rules / model / reasoning / people (DM-08), cost and elapsed time per batch, cache hits, per-question table, and a review list for the human band and disagreements with the record text (masked view), model probabilities and Claude explanation.
- `AiReady.tsx`: "Failure history" section with tagged modes/causes and confidence.
- `MissionControl.tsx` needs-you item: "N work-order tags need a person".
- `Agents.tsx`: decision model card with question types, guardrail ("Answers only typed questions; never sees names").

**Acceptance**
- 8,068 closed + 400 open work orders tagged; repeated descriptions are sent once (log shows unique-text count < record count).
- Rerun of stage 8 makes zero model calls and yields identical decisions (test).
- Every decision row has question, options, probabilities, confidence, model + version, ontology version.
- No user, customer or site name appears in any outbound payload (unit test on `mask.ts` over seed data).
- With no API key the local adapter runs the same flow; screens show the model in use.
- Vitest: flow banding, disagreement routing, 5% sample determinism, cache key, dedupe.

**Dependencies/risks**: Claude fallback cost is small at this volume; `projectState()` loads the whole dataset per request – with 8k more records add a per-project memo keyed on a state version (bumped by `touch()`), otherwise screens slow down.

### Phase B – Remaining decision uses (L)

**Scope**: the other seven uses, each replacing a hard-coded rule with rule → model → reasoning → person.

- **Two-step classification** (`asset.family` then `asset.class`, Choice): `rules.ts proposeFixes()` DQ-02 `classify` proposals take the class and confidence from decisions; `inferConcept()` becomes the rule step. Ontology `data/ontology.ts` gets a `family` grouping on concepts.
- **Duplicate pairs** (`asset.same_asset`, Yes/No): `validate()` generates candidate pairs with a looser key (site + normalised serial OR manufacturer+model+location); model probability sets fix confidence; only ≥ threshold pairs become `merge_duplicate` proposals.
- **Code lists** (`code.map`, Choice over ontology values): new `server/src/agents/codelist.ts` maps distinct status/failure/cause/craft codes from source records; exact matches settle at the rule step; unmatched still go to a person (guardrail). Code-list screen in `Ontology.tsx`/`Alignment.tsx` shows source → ontology value with step and confidence.
- **SM-02 plausibility** (`wo.cause_plausible`, Score 1–5): replaces the `TAPCHG` literal; low scores produce SM-02 findings with explanation.
- **Injection screen** (`text.instruction_like`, Yes/No) on every free-text field before it enters any Claude prompt (`assistant.ts contextBlock()`, `aligner.ts` top values, middle-band reasoner); flagged text is quoted as data with a marker and listed in the audit log.
- **Review risk** (`review.risk`, Score) on each mapping: stored on `Mapping.riskScore`; `Review.tsx` sorts by riskScore then confidence (RV-01).
- **Precedent relevance** (`precedent.relevant`, Score): `aligner.ts` drops or ranks precedents; Review panel shows relevance (ML-03).
- `rules.test.ts`: existing counts must still hold with the local adapter (DQ-01 = 18, SM-01 etc.).

**Acceptance**: each use visible on its existing screen with step + confidence; Decisions screen lists all eight questions; DM-07 switch-off falls back to rules + people only, without errors.

**Risks**: two-step classification and duplicates change data quality numbers on the reference project; document the new baseline in the eval harness (Phase D).

### Phase C – Skill library and the project learning loop (L)

**Scope**: AL-01…AL-05, AL-08, project scope only; loops "within a run" and "within a project".

**Data** (`db.ts`, `types.ts`)
- `skills (id, project_id NULL for shared, name, version INT, scope 'project'|'shared', status 'draft'|'approved'|'measured'|'proposed'|'tested'|'published'|'retired', owner, conditions JSONB, effects JSONB, body TEXT /* SKILL.md */, measured_effect JSONB, retired_reason, created_at)`, PK `(id, version)`.
- `skill_triggers (id, project_id, skill_id, kind 'corrections'|'load_errors'|'recovery'|'long_chain'|'drift', links JSONB, fired_at)`.
- `skill_uses (project_id, skill_id, version, agent_call TEXT, item TEXT, outcome TEXT, at)`.
- `skill_library_versions (version, published_at, published_by, skills JSONB)`; `projects.skill_library_version TEXT`.
- `audit_log`: add nullable `skills JSONB` (skills + versions loaded for agent entries, AL-04). Absent for old rows, so `JSON.stringify` of the hashed payload is unchanged and existing chains still verify (add a test).
- Mapping decisions: record `presentedAt` when a reviewer opens an item (`GET /mappings/:id` with actor) and `decidedAt` in `decide()`, so review time can be measured; add `correctionKind` (target change, rule change, not migrated, concept change) to change/reject decisions.

**Server (new `server/src/learning/`)**
- `format.ts` – read/write Agent Skills `SKILL.md` (front matter `name`, `description`, plus `metadata`: conditions, scope, owner, status, version, effects); export endpoint returns the file.
- `effects.ts` – whitelist of machine effects and the agents that apply them (`location_type_rule` → hierarchy/aligner, `pre_mapping_check` → aligner, `load_precheck` → loader stage 9, `threshold_adjust` within curator limits). Schema rejects anything touching guardrails, roles, SM/regulatory rules or ontology.
- `triggers.ts` – evaluated after each decision, question answer and load run: ≥5 same `correctionKind` on the same object/concept; ≥5 load errors with the same rule/reason; calibration drift per confidence bucket; long successful chains from `agent_events`. Counts in a per-pack config.
- `agents/steward.ts` – drafts a skill from a fired trigger (Claude structured output → SKILL.md + effects + links; offline template when no key); emits `needs_human`.
- `loader.ts` – selects approved skills whose conditions match (source system, version, pack, object); injects prose into LLM agents' system prompts; applies effects in deterministic agents; writes `skill_uses` and the audit `skills` field.
- `measure.ts` – before/after comparison per skill: reviewer acceptance, median review time, load errors (AL-05); moves status to `measured`.
- API: `GET /skills`, `GET /skills/:id` (+ `/SKILL.md`), `POST /skills/:id/decision` (approve/reject/retire – data subject expert only, reason on reject), `GET /skills/triggers`.
- Seed: the three example skills from the spec as *published shared* skills in library `SL 1.0.0` (they are written as general knowledge, not project findings); the reference project pinned to it.

**UI**
- New `web/src/pages/Skills.tsx` (nav *Knowledge*, "Skill library"): tabs *In use* (shared pinned version + project skills), *Drafts* (trigger evidence with links to corrections/runs, SKILL.md preview, approve/reject), *Effect* (acceptance, review time, load errors before/after), *Retired*.
- `Review.tsx` item panel: "Shaped by skill …" chip with link; "Reject skill" alongside reject proposal (AL-08).
- `MissionControl.tsx` needs-you: "Skill draft awaiting approval".
- `Agents.tsx`: skills loaded per agent; Steward card guardrail text.
- `Memory.tsx`: one panel explaining decisions vs. skills with link to Skills.

**Acceptance**
- Making five same-kind corrections on the reference project fires a trigger and produces a draft with links to the five decisions; it has no effect until a data subject expert approves; after approval the next alignment run logs its use and the affected proposals show the chip.
- A skill whose effects target a guardrail or ontology is rejected by the API (test).
- Audit chain verifies across old and new entries.

**Risks**: triggers on a single reference project will be sparse – supply a scripted correction scenario in tests, not in UI copy. Effect measurement needs enough volume; show "not enough data" honestly.

### Phase D – Evaluation harness and release gates (M)

**Scope**: real golden-dataset runs replacing the constants in `Agents.tsx`; gate for agent versions, ontology, decision model (thresholds) and shared skill library.

- `server/src/evals/golden.ts` – GD-01 derived from the Northvale seed: correct bindings (from `data/catalog.ts buildMappings()`), correct code-list values, correct parents, seeded errors (pumps under valves, duplicates, meter, PM hours, ratings), the hidden rule, and labelled failure modes for a sample of work orders.
- `server/src/evals/run.ts` + `npm run eval` – computes the spec metrics (binding precision/recall, code-list accuracy, hierarchy accuracy, rule detection, calibration error, hidden-rule recall) plus decision-model accuracy per question and per band; stores `eval_runs (id, subject, version, dataset, metrics JSONB, passed, at)`.
- Threshold tuning: compute auto/human thresholds per pack from GD results; curator limits stored per pack; project override stays inside limits.
- CI (`.github/workflows/ci.yml`): run `npm run eval` with the local adapter; fail if any metric drops below the stored baseline.
- `Agents.tsx` reads `/api/evals`; release table shows real runs.

**Acceptance**: baseline recorded; CI blocks a deliberate regression; Agents page numbers come from the database.

### Phase E – Shared skill library and curator flow (M)

**Scope**: AL-06, AL-07, cross-project loop, Learn stage.
- `learning/anonymise.ts` – strip names, values, site/customer terms from a project skill; curator reviews a sample.
- Curator endpoints: `POST /api/skills/:id/propose` (steward, after `measured` and positive effect), `POST /api/skills/:id/publish` (curator only; requires a passing eval run on all golden datasets with the skill loaded), `POST /api/skill-library/versions`.
- `POST /projects/:id/skill-library` – migration lead upgrades the pinned version; audited; reruns on the old pin reproduce results.
- Stage 14 in `orchestrator.ts`: real steward step listing ontology and skill proposals; respects `shared_learning` (default off).
- `Ontology.tsx` curator view gains a "Skill proposals" list next to ontology proposals.

**Acceptance**: a project skill from Phase C can be anonymised, tested, published to `SL 1.1.0`, and picked up by a second project only after its lead upgrades the pin.

### Phase F – Platform (after A–E, or in parallel where independent)

- **Jev adapter live** (M): obtain access (waitlist or DigitalOcean serverless route), finish `adapters/jev.ts`, run GD-01, data-processing review with TypeSafe; enable per project only after it passes (spec release plan). Risk: access or data residency blocks it – product runs on fallback unchanged.
- **Bulk job execution** (M): move decision jobs off the API process into an Azure Container Apps job or a worker replica reading a `jobs` table (`FOR UPDATE SKIP LOCKED`); progress via existing NOTIFY. Needed before multi-million-row volumes.
- **Observability** (S): token, cost and time per agent call and per stage into `decision_batches`/a `model_calls` table; Mission control cost panel (NFR observability).
- **Entra ID sign-in** (backlog, M): becomes more important – skill and decision approvals must be tied to authenticated named users.
- **PostgreSQL private networking, managed-identity image pulls** (backlog, S each, blocked on role-assignment rights).
- **Source connectors, Parquet/Excel** (backlog, L).
- **In-customer-environment decision model** (M): containerised local classifier trained on approved decisions (DM-02 second fallback, DM-07).

### Sizing summary

| Phase | Size | Depends on |
|---|---|---|
| A Decision core + failure tagging | L | – |
| B Other decision uses | L | A |
| C Skill library, project loop | L | – (uses A's question infra optionally for `correctionKind`) |
| D Eval harness + gates | M | A, B for decision metrics |
| E Shared skills + curator | M | C, D |
| F Platform | M–L items | Jev access, Azure permissions |

---

## 5. Open questions / decisions

1. **Jev access**: do we have (or want to apply for) TypeSafe access, and is the DigitalOcean serverless route acceptable for customer data? Until then Phase A ships on the Claude Haiku fallback and the local classifier – agree?
2. **Default decision model per project**: `fallback` (Claude Haiku) or `local` when no customer approval exists? Who may switch it (migration lead, platform admin)?
3. **Closed work-order history**: OK to add ~8,000 closed work orders to the reference project so tagging and scale are real? This changes dashboard and data quality figures.
4. **Two threshold sets**: spec uses 0.95/0.75 for mapping review and 0.85/0.60 for bulk decisions. Keep them separate (our assumption)?
5. **Skill effects**: accept that skills change deterministic agents only through a whitelisted set of structured effects, with prose skills limited to LLM agents?
6. **Skill storage**: SKILL.md text in PostgreSQL with export (proposed), or files in Blob Storage / the repo?
7. **Seeded shared skills**: publish the spec's three example skills as library `SL 1.0.0`, or start with an empty library?
8. **Approvals before Entra ID**: is persona selection acceptable for skill and decision approvals, or should Entra ID move ahead of Phase C?
9. **"Shared" scope today**: one deployment = one tenant. Treat other projects in the same deployment as the shared memory until multi-tenancy (spec Phase 3)?
10. **Eval baseline**: replacing the static metrics on Agents & evals with real GD-01 results will change the displayed numbers – acceptable?

---

Sources (outside the spec): [DigitalOcean – What is Jev](https://www.digitalocean.com/resources/articles/what-is-jev), [DataCamp – System One models: Jev](https://www.datacamp.com/blog/system-one-models-jev), [VKTR – TypeSafe AI launches with Jev](https://www.vktr.com/ai-platforms/chatgpt-cocreator-launches-typesafe-ai-with-jev/), [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs), [Inside Hermes Agent](https://mranand.substack.com/p/inside-hermes-agent-how-a-self-improving), [Kanerika – Hermes Agent review](https://kanerika.com/blogs/hermes-agent/).
