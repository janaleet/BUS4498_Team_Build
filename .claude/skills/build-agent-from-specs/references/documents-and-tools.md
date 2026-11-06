# Documents, templates, and tool contracts

Read the document section at Stage 2 and the tool section at Stage 3. Derive these inventories from the approved task map; do not impose a business domain or a particular file format.

## Context and template inventory

For each task input/output, record its name, task, kind, provider/producer, required contents, format, source reference, sensitivity, destination, and current status. Useful statuses are available and usable, needs correction, user to provide, synthetic approved, generated upstream, optional unknown, and blocked. These are build-readiness statuses, not replacements for the application's business statuses.

External evidence may include policies, profiles, transaction tables, catalogues, contracts, or images. Output templates may include reports, spreadsheets, forms, email drafts, or structured response schemas. An upstream result is not a missing user document. Human answers are collected by the implemented review flow, not fabricated during setup.

When something is missing, show the gap and the smallest required example structure before asking the user to provide it or approve a synthetic substitute. Allow mixed provenance by item. If synthetic data is chosen:

- Use clearly fictional entities and label the dataset and UI as synthetic. Do not create apparently genuine credentials, consent, signatures, citations, or completed external transactions.
- Keep linked identifiers, dates, totals, units, and relationships internally consistent. Preserve unknown values instead of filling every field with invented certainty.
- Include a normal case and relevant missing-input, ambiguity, rejection, or duplicate case from the actual workflow. Avoid a large arbitrary fixture collection.
- Include realistic sparse or irregular evidence, not only perfectly populated records shaped like the parser's output. For retrieval tasks, exercise unavailable, stale, conflicting, duplicate, and incomplete source content when relevant; label fictional URLs as test fixtures.
- Keep synthetic and user-supplied records distinguishable in storage and results. A synthetic test never proves a real business outcome.

Preserve supplied templates as formatting authorities. Create missing templates in the format the recipient needs; do not silently downgrade an editable workbook or Word form to plain Markdown. Use installed format-specific skills when needed. Write generated versions separately from originals and verify both their content and usability.

Record a repository-relative destination and publication disposition for each new context/reference file, template, or fixture. Preserve supplied originals and use the existing layout or `docs/context/`, `docs/references/`, and `templates/` as appropriate. Review prepared copies at setup or the relevant feature checkpoint and add them to the accumulated final manifest; publish and verify them after final exact-file approval using [the repository workflow](staged-build-and-git.md). A document approved for application use may still require a redacted copy or private storage for repository publication. Do not silently omit it or publish its private contents.

## Tool-plan contract

Use [model and tool selection](model-and-tool-selection.md) before asking the user to choose among services. Start with relevant entries in the bundled business-tool workbook, then include justified alternatives when they better fit the task, runtime, access, or budget. Present actual named options in a concise comparison table and identify a recommended route. The catalog is a dated starting point; verify shortlisted operations, setup, access, and pricing from current official documentation. A tool's availability to Codex is separate from its availability to the finished application. Reuse approved choices and include the selected route in the tool plan below.

Give each tool one stable name and include:

| Field | Required decision |
| --- | --- |
| Task mapping | Which task/subtask calls it; existing or proposed addition |
| Feature group and file destination | First group needing it; standalone script path or application module path; publication checkpoint |
| Inputs/outputs | Named contracts from the task specs; validation and error result |
| Operation | Actual computation, retrieval, record change, or communication |
| Implementation | Existing callable, file operation, script/function, query, API, or MCP |
| Runtime location | Browser, local backend, hosted backend, or approved external service |
| Access | Non-secret account/resource details, auth method, scopes, and secret variable names |
| Permission | Read/write boundaries, allowed resources, human gate, sample/live behavior |
| Limits | Task-wide/call limits, deadline, cancellation, retry conditions and counts |
| State safety | Version checks, idempotency key, read-back, and uncertain-result handling when relevant |
| Verification | Fixture test plus any specifically authorized live connection test |
| Evidence quality, when relevant | Acceptable sources; exact entity and claim checks; freshness; incomplete/conflicting evidence; user-visible status |

Use specified values. Where the specs omit a value needed for safe execution, propose a concrete default for the tool plan and obtain its approval; do not import numerical caps from another application. A retry rule for a read cannot automatically authorize retrying a send or write.

Separate an MCP server's address/transport and authentication from its business tool names. A Codex connector session may have no reusable application credential. Verify whether the finished runtime can authenticate and call it independently; if not, propose a supported runtime integration or identify the build as Codex-dependent. Do not scrape credentials from Codex or borrow its private session state.

For L2 and L3 inference operations, define the provider-adapter contract during planning, including structured results and limits. Resolve the selected model before implementing the first group that needs inference, then bind it within that group. Plan the full tool inventory but build only the current group's dependencies; model selection does not require all other tools to be implemented first.

## Evidence policy for search and retrieval

Use this section only when the application retrieves or assesses external facts. Specify acceptable source types and authority, the access method supported by the intended runtime, identity checks, relevant dates/freshness, required claim support, and allowed dispositions. Prefer the responsible primary source where available; another source can be used only with the evidence status and authority allowed by the plan. A known provider's name does not verify every record it hosts. Do not hardcode one project's source portfolio into another build.

Keep discovery and verification distinct. Search snippets, model-generated summaries, and candidate URLs are leads. Retrieve the underlying document or authoritative API record and establish that it describes the exact entity and supports the facts used in the decision. A successful HTTP response alone does not verify the required claims. Reject login pages, soft 404s, unrelated records, and sources that fail the task's entity, freshness, or claim-support requirements. Homepages and historical or expired records support only facts actually established by their content; they do not establish current availability by themselves. Preserve the observed/canonical URL or document reference, retrieval time, source identity, relevant date/version, and supporting excerpts or field references. Do not invent citations or infer authenticity from a plausible URL.

Validate evidence at claim level. A quotation must both occur in the referenced source and support the associated claim; a syntactically valid citation is insufficient. Prefer stable excerpt/field IDs returned by the retrieval tool so the model selects existing evidence instead of recreating quotations. Keep verified facts, tentative inferences, and unresolved facts separate in storage and presentation. Retrieval failures, conflicts, stale content, and missing facts must not be relabeled as fit judgments or user deficiencies.

Keep discovery broad enough for the approved goal while enforcing actual constraints during evidence-based screening. Do not turn every preference into an exact quoted search term or a missing field into a rejection rule. Define hard conflicts, decision-blocking unknowns, and nonblocking unknowns in the approved design. If sources or filters yield no useful items, report the search/read/verification/assessment counts and reasons; diagnose access, extraction, and filtering separately. Never pad results, relax constraints, or claim exhaustive coverage to meet a target count.

Within the approved plan, check representative exact records through the real reader/extractor and target runtime, not just a provider health endpoint. Exercise supported page/API shapes and partial-data cases. Treat search availability, extraction, evidence validation, and assessment as separate outcomes. For an unavailable item, follow the approved skip/hold/stop rule and continue independent items when permitted. Source substitutions, new tools, extra costs, and broader search scopes need the corresponding authorization; an inaccessible source is not permission to bypass its access controls.

## Implementation readiness

Implement the current group's approved callables and orchestration, including validation and error propagation; track all remaining tools for later authorized groups. Test a tool through the same application boundary that the controller will call. Mocks exercise contracts but do not establish connectivity. A connection test should be minimal and read-only where practical; a side-effecting test needs the approved target and effect, not a blanket instruction to try the workflow.

Keep standalone tool/utility scripts in `scripts/` or the repository's equivalent and imported adapters in their application source locations. Include their tests, dependencies and safe usage/configuration examples in the current group's publishing manifest. Approval of a tool plan does not authorize implementing the tools for every future group before the user's intervening reviews.

Do not mark a tool ready merely because its name appears in a registry or a stub returns a plausible JSON object. Record implemented, contract-tested, connection-tested, and blocked states separately, with sanitized evidence.

Plan bounded live acceptance tests as part of the tool plan when external evidence is essential. State the representative journey, total call/cost limits, side effects, and any repair/retest allowance. Reuse authorization that covers the remaining test scope; do not ask again for every substep. Respect explicit one-run or zero-retry limits. If only connection tests are authorized, record end-to-end behavior as unverified.
