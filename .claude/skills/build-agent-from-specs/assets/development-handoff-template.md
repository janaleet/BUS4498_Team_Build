# Development Handoff — <System name>

Populate this document from the finalized implementation, configuration, and observed verification evidence. Save it as `docs/development-handoff.md` under the application root, or use the project's established documentation location. Replace these authoring instructions in the delivered copy. This is a current-state engineering reference, not a change log. Link detailed evidence instead of copying the build's conversation, approval history, or discarded alternatives.

Cover the sections that apply to this system. Mark consequential unknowns or unverified behavior explicitly; use “Not applicable” with a short reason where appropriate. Record configuration names and safe references, never credentials or private user records. If the repository audience cannot receive the full handoff, retain an access-controlled copy and prepare a safe repository summary with an authorized access route.

## 1. System and readiness snapshot

- System name, goal, intended users, and supported operating scope:
- Handoff prepared/last reconciled date:
- Confirmed design baseline: repository/application root, README, workflow, task specifications, and revision or hashes:
- Implementation and tested baseline: branch/commit or local file manifest, including uncommitted differences affecting the result:
- Delivery target and access address: local / Codex Sites / GitHub Pages / supporting services:
- Deployed source revision and environment, if verified; otherwise unknown or not deployed:
- Current status, separately: functional coverage, tool/model connections, verification, user acceptance, repository publication, and deployment:
- Required features incomplete or deferred, operational restrictions, and links to blocking review items:
- Maintainer/service owner and support contact, if assigned; otherwise unassigned:

Identify the code/configuration tested without claiming this handoff contains its own final publication commit. Link the verified publication receipt or report when available. A working demonstration does not by itself establish production readiness.

## 2. Architecture and repository map

Explain the request/data path from frontend through controller, tools/models, storage, human review, and displayed/exported output. Identify execution locations and trust boundaries; include a compact diagram when it clarifies the system.

| Component | Responsibility and execution location | Entry point / source path | Dependencies and interface |
| --- | --- | --- | --- |

- Frontend routes and principal user journeys:
- Workflow/task-to-implementation map and feature acceptance ledger:
- Runtime entry points, prompt/skill files, context documents, output templates, schemas, tests, and operating scripts:
- External services and host-app dependencies; what stops working if they are unavailable:

## 3. Final runtime, model, and configuration setup

- Supported/tested OS, runtime versions, package manager, dependency manifests and lockfiles:
- Environment topology: local/test/deployed configurations that actually exist:
- Model mapping by task: provider, exact callable model ID or local artifact/version, endpoint, required capabilities, prompt/skill reference, and relevant parameters:
- For learned classifiers/predictors: artifact version, feature/label definitions, preprocessing, training/evaluation provenance and limitations:
- Application defaults and overrides: modes, resource limits, timeouts, retries, concurrency, and cost/call limits, with enforcing source/configuration locations:

| Configuration name | Purpose and consuming component | Required or optional / safe default | Where configured or securely provisioned | Current readiness |
| --- | --- | --- | --- | --- |

Record secret names and provisioning locations only. Distinguish selected settings from confirmed runtime settings. Explain consequential final choices briefly where needed for maintenance; omit the history of alternatives considered.

## 4. Tools and external integrations

| Tool/service and tasks | Actual runtime route, operation, and contract reference | Authentication method and permitted resource scope | Side effects and safeguards | Connected / verified status and evidence |
| --- | --- | --- | --- | --- |

- API endpoints or MCP server/transport references, adapter locations, and required service versions:
- Input/output schemas, error conventions, rate limits, timeout/retry behavior, and idempotency or uncertain-write handling:
- Retrieval source eligibility, identity/freshness checks, claim support, and unavailable-source behavior, where relevant:
- Account/service ownership, billing responsibility, observed or estimated usage/cost assumptions, and unresolved dependencies:
- Mock/sample/live boundaries and how the operator can identify the active mode:

## 5. Data, documents, and persistence

- Required context/reference documents and templates: purpose, safe path, provenance/version, and update procedure:
- Data stores and system of record: schema/contract references, case/artifact identifiers, migrations and applied version:
- Local/hosted data and output locations; what survives refresh, process restart, redeployment, or machine loss:
- Data sent to external services, sensitivity, access/user isolation, retention/deletion behavior, and excluded private files:
- Backup and restore procedures, coverage and last verification; explicitly identify absent or untested recovery:
- Document/data ownership and refresh responsibilities, if assigned:

## 6. Workflow controls and human review

- Triggers, task sequence, decision rules, and conditional branches; reference confirmed specifications:
- State transitions, persistence, duplicate prevention, stop/cancel behavior, and retry/recovery rules:
- Human escalation: who reviews, what evidence they see, required/optional answers, authorization/version checks, and how the correct case resumes:
- Automation authority: permitted tool actions, prohibited actions, approval boundaries, and where the runtime enforces them:
- Assessment/ranking rules, missing/conflicting evidence handling, explanation format, and reassessment scope, where relevant:
- Schedules/background work: owner, host/process, timezone, enable/disable controls and restart behavior; state absent or disabled when applicable:

## 7. Setup, operation, and release runbook

Give exact commands or supported UI steps for the selected environment, including working directories, prerequisites, and expected success indicators. Reference existing accurate operating instructions instead of duplicating them. Label instructions that have not been exercised.

1. Obtain the documented source version and install its dependencies.
2. Provision configuration and secrets securely; initialize required documents, storage, and migrations.
3. Start the app and verify readiness. For local delivery, include the easy launcher, local address, reopen and stop steps, ports, and saved-data locations.
4. Run the documented safe sample/test journey and distinguish it from live operations. State any permissions, costs, or effects required by a live check.
5. Locate logs, health signals, errors and outputs; explain common observed setup/runtime failures and recovery steps.
6. For hosted delivery, identify build/deploy commands or workflow, target environment, source mapping, authentication/network/CORS/base-path configuration, and deployment verification.
7. Describe supported rollback/recovery, including data/migration constraints. Mark missing or untested procedures; do not imply data restoration from a code rollback alone.

Document monitoring/alerting and service ownership as implemented, or identify the gap. These instructions do not authorize deployment, paid tests, business actions, or scheduler activation.

## 8. Verification evidence and limits

| Capability / critical scenario | Tested revision and environment | Data mode / integration mode | Expected and observed result | Evidence or repeatable check | Gap / review item |
| --- | --- | --- | --- | --- | --- |

Link the detailed feature ledger and relevant test reports. Summarize coverage of normal/exception paths, real input entry, human pause/resume, evidence quality, model suitability, persistence, UI accessibility/responsiveness, and delivery checks as applicable. Include test commands and required fixtures/configuration. Separate automated tests, agent walkthroughs, user acceptance, and untested live behavior. State sampling and evaluation limits; do not treat connection success or deployment as workflow acceptance.

## 9. System engineer review register

Prioritize actual unresolved issues and consequential assumptions requiring engineering review. Distinguish confirmed defects, missing setup, unverified behavior, and optional improvements. Each item must identify what to inspect and what would resolve it; avoid generic “review security” entries.

| ID / priority | Component and exact file/configuration | Finding or review question and operational impact | Next check/action and pass criterion | Evidence / current status | Owner or unassigned | Blocks intended release/use? Why? |
| --- | --- | --- | --- | --- | --- | --- |

Consider applicable access/secrets and public exposure, data isolation/recovery, integration failure behavior, workflow authority, model/source reliability, deployment reproducibility, dependency constraints, observability, workload/cost limits, and ownership. Add items only where supported by a finding, an unresolved assumption, or a consequential check not yet performed. Do not mark an item resolved merely because it is documented, or invent an engineer's sign-off. If no blockers were identified within the checks performed, state that bounded conclusion alongside remaining unverified areas.

## 10. Maintenance references

- Links to finalized specifications, operating documentation, configuration examples, schemas, tool scripts, prompt/task-skill packages, dependency files, and verification artifacts:
- Location/access route for restricted operational documentation, where authorized:
- Responsibility for keeping this handoff synchronized with material runtime, model, integration, data, and deployment changes:

Historical decisions and file-by-file change records remain in Git and the internal build record. They are not required content in this final handoff.
