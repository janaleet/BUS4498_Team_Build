# Agent Build Record

Copy this template into the selected project's non-public documentation area. Populate sections as each stage is reached. Unreached stages remain pending. Replace these instructions in the project copy. Record references to secret configuration, never secret values. This internal record may retain decision/change history; it is separate from the final-state development handoff created from `assets/development-handoff-template.md` in the skill package.

## Source and scope

- System name and goal:
- Repository and application root:
- Initial selected branch/commit or local source hashes:
- User-confirmed source revision or local hashes used for the build, including optional revisions:
- README, workflow, and task-spec locations:
- Working-tree changes preserved:
- Requested deliverable and explicit exclusions:
- Runtime/hosting choice and audience:
- Original repository, app subfolder, approved publication branch and direct-push/PR route:
- Separate hosting/Sites repository and source-path mapping, if applicable:
- Current original-repo publication baseline and verification:

## GitHub readiness

- Host (Codex / Claude Code), connection route, and non-secret account/workspace identity:
- Intended repository and selected source branch:
- User readiness confirmation and date, or valid prior confirmation reused:
- Read-only access checks, results, and evidence; identity unavailable where applicable:
- Publication permissions/branch constraints: verified, missing, or unverified:
- Missing setup and next step, or explicit local-only/no-publication exception or deferral:
- Recheck after host/account/workspace/repository changes or access failure:

Connection readiness and user authorization to publish are separate decisions. Record credentials only by configuration location/name, never their values.

## The plans

- `runtime/` folder used:
- Hosting plan / memory plan / permission plan: present (file and hash), or missing with the user's choice (added later, or build without it):
- Test plan (written once the agent runs): present (file and hash) or not yet; its input field and the models it compares:
- Rules files: from the repository, or the bundled copies in `references/plans/` (and why):
- Tasks: from the task specifications, or the hosting plan's list replacing them; whether the user approved updating the specifications to match:
- Plans versus specifications: each overlap or conflict, what each source says, and what the build follows (the plan):
- Questions where the plans contradict each other, and the user's answers:

## Stage status and decisions

| Stage | Status | Decision, user instruction, and reviewed artifact/version | Remaining question |
| --- | --- | --- | --- |
| GitHub readiness confirmation and access check, or explicit exception | Pending | | |
| Specification summary and user confirmation | Pending | | |
| Optional specification revisions, if chosen | Pending or not applicable | | |
| Confirmed local source baseline recorded | Pending | | |
| Task-skill recommendation and user choice | Pending | | |
| Optional task-skill creation and review, or skip/deferral | Pending | | |
| Context documents and templates | Pending | | |
| Tool plan | Pending | | |
| Ordered feature-group plan and first-group authorization | Pending | | |
| Tool implementation and access | Pending | | |
| Model and runtime | Pending | | |
| UI preferences and implementation | Pending | | |
| Verification and delivery | Pending | | |
| Final-state development handoff and engineer review register prepared/reconciled | Pending | | |
| Final GitHub publication approval and remote verification, or explicit local-only decision | Pending | | |

Record the user's actual decision and its scope; do not prefill approval. A stage status is not authority to perform unrelated actions.
Keep this summary current as stages change. Dated notes may preserve history but must not be the only place the latest readiness state appears.

## Specification summary and confirmation

- Source files and exact revisions or hashes reviewed:
- Agent goal, audience, inputs, outputs, and authority boundaries:
- Workflow sequence, task handoffs, user decisions, and exception paths:
- Feature ledger reference and material questions needed for faithful implementation:
- Summary shown to user and review artifact/version:
- User decision: confirm specifications as written / request targeted revisions:
- If revised: requested scope, changed source files, local diff, and verification:
- If confirmed as written: statement that no specification files were changed:
- Confirmed source baseline and readiness to begin context-document preparation:
- Local source state versus final GitHub publication status:

Do not make a general flaw audit or correction plan a prerequisite. Record the user's chosen baseline. If a missing rule later blocks faithful implementation, ask a narrow question and record its answer or approved scope decision.

## Optional reusable task skill

- Reviewed workflow/specification revision and recommended task ID/name:
- Selection rationale, output-standardization needs or reusable-process value, alternatives considered, and existing skills checked:
- User choice: create recommended / choose another / skip / defer; selected task and scope:
- Needed templates, references and examples; supplied-file inventory links and remaining gaps:
- Skill name, target host, portable package path, and intended installation scope:
- Source mapping, dependencies, and standalone use or planned application integration:
- Validation/example-run evidence, external tests authorized, and limitations:
- Reviewed skill version and user acceptance, revisions, or explicit deferral:
- Installation and publication decisions, exact files/destinations, and verified status:
- Next permitted build step:

Reuse the shared document and publication inventories below. A requested task skill remains tracked until delivered or explicitly deferred; its existence does not prove application integration.

## Task and implementation map

| Task ID and exact name | Behavior/level | Inputs and producer | Outputs and recipient | Transition/handoff | Implementation and verification |
| --- | --- | --- | --- | --- | --- |

## Feature acceptance ledger

| Requirement ID and source reference | Required behavior, condition, and actor | Expected observable result | Implementation and UI route, or why no UI is needed | Implemented / connected / verified status | Scenario and evidence | Gap or approved scope decision |
| --- | --- | --- | --- | --- | --- | --- |

Extract all requirements before implementation, including conditional branches, human tasks, required input entry/updates, and output types. Distinguish explicit requirements, necessary enabling interactions, and proposed additions. One task may need several rows. Populate evidence from observed results, not intended behavior or test counts.

## Feature groups and approval checkpoints

| Group ID / user-visible outcome | Requirement IDs and dependencies | Scope, needed tools/model/UI, and expected files | Acceptance scenarios and evidence | Reviewed version and user acceptance | Local files added to final manifest | Permission to continue to named next group |
| --- | --- | --- | --- | --- | --- | --- |

- Active authorized group and its scope:
- Current group status: planned / implementing / awaiting review / revisions requested / accepted:
- Current review artifact, version and actual user decision:
- Publication status: local pending final review / explicitly published early / final push verified / final push blocked / local-only by user request:
- Next permitted action and any pending checkpoint:
- Earlier accepted groups affected by later changes:

Plan approval is not acceptance of implemented groups. Record group acceptance and continuation separately from final GitHub publication and any hosting deployment. Do not advance through a pending group acceptance checkpoint; an accepted local group may advance without a GitHub push.

## Repository artifact and publication manifest

| Artifact/source and provenance | Purpose and group | Destination repository and relative path | Sensitivity and publication disposition | User approval scope | Local/committed/pushed status | Verified commit/link or exclusion reason |
| --- | --- | --- | --- | --- | --- | --- |

- Accumulated reviewed change set and target branch/PR for final publication:
- Unrelated working-tree, staged or outgoing changes excluded:
- Relevant tests and staged-diff review:
- Remote commit/content read-back:
- Private originals and local-only artifacts retained at:
- Separate original-repo push, PR merge and Site deployment status:

Include user-supplied context/reference documents, templates, any accepted task-skill package, generated standalone tool scripts, application modules, tests, safe configuration examples, dependency files and operating documents as applicable. Use existing folders or agreed defaults. Preserve originals; exclude secrets and unapproved private data. Record an explicit disposition for every requested file. Keep this full private record out of published paths and generate a suitable summary when needed.

## Context and output-template inventory

| Task/input/output | Kind and required contents | Provider or producer | File/reference and provenance | User-provided/synthetic choice | Readiness and unresolved items |
| --- | --- | --- | --- | --- | --- |

## Approved tool plan and readiness

- Task-specific API/library/MCP comparison table and recommended option:
- Workbook sheet/row references, outside-catalog alternatives, official sources and check dates:
- Actual user selection or delegated choice; access, cost and runtime assumptions still unverified:

| Tool and tasks | Input/output contract | Route and runtime location | Access/scopes and secret-reference names | Limits, side effects, and human gate | Approved tests | Implementation/connection evidence |
| --- | --- | --- | --- | --- | --- | --- |

## Model configuration

- Task-specific model/classifier/predictor comparison tables and selection rationale:
- Workbook sheet/row references, official sources, check dates and unverified claims:
- Model named in each task specification, its role or constraint, and whether it was feasible:
- Student decision for each model-dependent task: keep specified / choose alternative / delegate; decision date and rationale:
- If changed from a binding specification: targeted source revision, exact diff, and affected capability checks:
- Task-to-model mapping and user selection or delegated choice:
- For classifiers/predictors: target labels or outcome, training/evaluation data needs, baseline, suitable metrics, and held-out evaluation status:
- For local models: artifact/repository/version, hardware, dependencies, license and hosting responsibility:
- Selected provider, exact API model ID, and endpoint:
- Default versus task-specific overrides:
- Required model capabilities and official documentation checked:
- Secret variable/reference name and redacted connection status:
- Approved inference limits and live-test scope:
- Controller enforcement, state, and pause/resume behavior:

## Retrieval and evidence policy, when applicable

- Accepted source types, identity checks, and relevant dates/freshness:
- Required claim support and evidence-reference format:
- Decision-blocking unknowns, nonblocking unknowns, and explicit conflicts:
- Unavailable, stale, wrong-entity, or contradictory source behavior:
- Actual runtime source/reader checks and representative end-to-end evidence:
- Bounded live acceptance authorization, remaining limits, and any repair/retest allowance:

## Human questions and recipient-facing outputs

### Assessment and ranking design, when applicable

- Representative real inputs examined, observed availability, and sampling limitations:
- Essential inputs, commonly available comparison inputs, optional enrichment, and decision-specific requirements:
- Approved ranking/scoring method, evidence sufficiency, missing-data treatment, provisional results and ties:
- Matching evidence and evidence-gap presentation:
- Optional information entry, explicit reassessment trigger, affected scope and ranking-update rule:
- Provenance/version history, unanswered or conflicting information, and item/shared failure handling:
- Verification of initial ranked results, leaving gaps unanswered, and reassessment with new evidence:

| Handoff or output and audience | Plain-language question or conclusion | Required answer / reasons and evidence | Unknown/decline handling and consequence | Next action | UI walkthrough evidence |
| --- | --- | --- | --- | --- | --- |

Record representative normal and uncertain cases. A raw schema or status code does not establish a usable question or explanation.

## Frontend and hosting choices

- Intended users, devices, and testing workflow:
- Local / Codex Sites / GitHub Pages delivery, execution locations, and required connectivity:
- For Pages: browser-only or external backend; feature-support comparison, remaining dependencies, and their owner/costs:
- For Pages: site URL/base path, repository and publishing source/workflow, audience, push-to-deploy behavior, and deployment authorization:
- For Pages: public artifact inspection, routes/assets, backend authentication/CORS, storage and scheduled-job evidence as applicable:
- For local delivery: target OS, launcher, readiness check, start/reopen/stop commands and verification:
- Local data/output locations, persistence after restart, and internet/API or host-app dependencies:
- Style references, colors, typography/fonts, and theme:
- Animation and reduced-motion preference:
- Must-have screens, controls, uploads, and outputs:
- Sign-in, audience, sharing, and persistence needs:
- User delegation of any unspecified choices:
- User journeys and screen/interaction plan, mapped to required features:
- Preview location and synthetic/live labeling:
- Desktop/narrow-screen screenshots and visual issues corrected:
- User feedback or remaining subjective design preferences:
- Deployment authorization and confirmed delivery location:

## Verification evidence

| Scenario and task(s) | Data mode and integration mode | Expected observable result | Actual result and evidence | Remaining limitation |
| --- | --- | --- | --- | --- |

## Final-state development handoff

- Completed document path/link and intended audience:
- Confirmed design and implementation/tested baseline covered:
- Date reconciled with actual source, configuration, and evidence:
- Final setup, run/recovery instructions, and referenced files checked; unperformed checks:
- Engineer review register: unresolved/blocking items and owner or unassigned:
- Restricted full copy / safe repository summary locations, if needed:
- Artifact manifest entry and final publication disposition:

This section tracks delivery of the separate engineering reference; it does not replace that document. Keep historical decisions and file-by-file changes here or in Git, not in the final-state handoff.

## Handoff and continuation

- Required features verified and explicitly incomplete/deferred items:
- Functional completeness, source quality, UI review, and deployment status separately:
- Implemented tasks and working tool/model connections:
- Unconnected, mocked, or unverified components:
- Working URL and safe start/stop instructions:
- Output/storage and review locations:
- Next unresolved user decision or setup step:
- Next permitted build action:
- Accepted groups, pending review and next authorized group:
- Approved artifacts still awaiting repository publication:
- Source push, deployment, and external business-action authorization:
