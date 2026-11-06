# Repository intake and specification confirmation

Read this reference during Stage 1. Students may arrive with finalized specifications; use their actual files as the starting point.

## Select and record the source

Resolve the application root, system-goal README, workflow, task-spec folder, and repository branch or commit. For a local checkout, preserve existing changes and record relevant file hashes when uncommitted content is selected. Read applicable `AGENTS.md` instructions. If the layout differs from the expected paths, show the mapping. If an essential file is absent, ask the user to supply it or choose to draft it; do not present an inferred document as their finalized specification.

## Summarize what the agent will do

Read the goal, full workflow, and every task specification, including human tasks. Give the user a concise summary with source references that covers:

- Intended user, problem, goal, and observable result.
- Trigger, ordered task flow, important branches, and completion condition.
- Inputs and their providers; outputs and their recipients.
- Human decisions, external actions, permissions, and important failure or recovery paths.
- Expected interface, runtime, storage, model, and tools when specified.

Use the project's task names and terminology. A small task map can help when the workflow is complex, but do not turn this confirmation into a mandatory major/minor flaw audit, wording review, or proposed redesign. If a material ambiguity is evident, identify the exact source and practical consequence as a focused question. Do not silently invent a business rule, permission, score, or external action.

Extract a feature acceptance ledger from the README, workflow, and task specifications. Each testable row needs a source reference, trigger or condition, expected user-visible outcome, and acceptance scenario; include conditional branches and human controls. Distinguish stated requirements from implementation support and optional enhancements. Add implementation locations and observed evidence as the build proceeds. The ledger checks whether the finished app follows the confirmed specifications; it does not require rewriting them.

## Ask for the user's choice

Show the summary, then ask whether to **use the specifications as written** or **revise them before building**. Record the chosen source revision or local hashes and the user's decision.

- **Use as written:** Make no specification edits. Proceed to the optional task-skill choice, then context and tool planning with the confirmed files as the behavior contract. Resolve ordinary implementation choices in the plan. A minor ambiguity does not force a correction cycle.
- **Revise:** Ask what the user wants changed. Propose the affected files and concrete behavior before editing; apply only approved changes, preserve supplied headings/fields and unrelated content, verify linked handoffs, and show the resulting local diff. Record the revised files/hashes for the final publication manifest.

If an essential missing decision later prevents faithful implementation or changes authority, ask a narrow question for that feature. The user may choose a rule, explicitly defer the feature, or revise the specifications. Do not silently implement a different rule or claim an underdefined feature is complete. Do not reopen a general specification audit because the user chose to proceed as written.

## Assessment and comparison tasks

For workflows that rank, assess, or recommend items, check representative supplied records or accessible real examples before selecting mandatory fields or an algorithm. Record which inputs are commonly present, irregular, missing, or unreliable; synthetic examples alone cannot establish availability. Base routine comparisons on the smallest meaningful set commonly available in that domain while retaining consequential unknowns. Do not impose a universal score scale, weighting scheme, result quota, or field-availability threshold.

Plan ranked results with matching evidence, evidence gaps, and an optional user-supplied-information route for explicit reassessment when the confirmed task calls for comparison. Keep missing evidence, source failure, explicit conflict, and negative evidence distinct. A user may know their own facts but should not be asked to certify another party's unsupported facts. If the source does not define a decision-critical rule, raise it as a targeted choice during planning rather than converting it into a required pre-build correction campaign. Record any resulting approved change in the source only if the user chooses to revise it.

## Handoff to planning

The confirmed source revision, user decision, concise summary, feature ledger, and any optional approved revisions enter the private build record. Proceed to Stage 1A with this baseline, then Stage 2 after the task-skill choice. GitHub publication remains at the final checkpoint under [incremental builds and repository publishing](staged-build-and-git.md).
