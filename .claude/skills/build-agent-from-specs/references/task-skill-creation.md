# Offer and create a reusable task skill

Use after the user confirms the workflow and task specifications as written or completes any optional targeted revisions. GitHub publication waits for the completed build. This is an optional deliverable within the build. Keep its source revision and user decision in the build record.

## Recommend one task

Compare the reviewed tasks using evidence from their specifications:

- **Reuse:** likely to recur with different inputs or be useful outside this single run.
- **Output consistency:** benefits from a recurring structure, required fields, template, evidence presentation, or quality standard. This is a strong selection signal, not a universal requirement for skills.
- **Procedural value:** benefits from repeatable instructions, domain rules, reference material, or output templates beyond a trivial command.
- **Clear scope:** identifiable trigger, inputs, output, and completion conditions; dependencies can be provided or explained.
- **Testability:** a representative example can demonstrate useful behavior and relevant missing-data or exception handling.
- **Authority:** the skill can preserve the task's human decisions, evidence requirements, and limits on external actions.

Give particular weight to tasks that repeatedly produce a standardized deliverable and require a reusable procedure or substantive checks. Standardize the output's structure and quality expectations while allowing its evidence and conclusions to vary with the inputs. A review, decision method, or tool sequence may also benefit from a skill even with flexible outputs. If the need is solely a fixed layout or field schema, explain when a template or deterministic tool would suffice.

Recommend the strongest candidate with its exact task ID/name, specification path/section, intended use, and a brief reason it is more suitable than the closest alternative. Use judgment; no fixed numerical score or preferred business domain is required. Check for an existing suitable skill before proposing a duplicate. Do not automatically select the most autonomous task, the first task, or an assessment task. If none is a strong candidate, explain the limitation and offer the closest useful option without forcing a skill.

Ask: **“I recommend creating a reusable skill for [task ID/name] because [specific benefit]. Would you like me to create it, choose a different task, or skip/defer this step?”** Reuse an existing explicit decision. A skip/defer choice allows the build to continue; do not repeat the offer unless requested or materially affected by later specification changes. A pending answer is not consent to create the skill.

## Gather only the materials this task needs

After the user accepts, identify missing materials from the selected task's input/output contract. Reuse the shared document inventory and inspect relevant files already supplied before asking for more.

| Material, when needed | What to ask for |
| --- | --- |
| Output template or example | Desired structure, required fields, editable format, and a representative successful output |
| Reference documents | Policies, rubrics, definitions, procedures, or other authoritative content needed to perform this task |
| Representative inputs | An accessible example and, where useful, an incomplete or ambiguous case; distinguish reusable examples from private live records |

Explain each missing item's purpose and minimum useful contents. Request uploads or accessible paths through a supported interface. Offer user-provided materials, clearly labeled synthetic examples/templates, or a mix when appropriate; generate synthetic business content only with the user's agreement. Honor prior document-format preferences. Preserve originals and do not fill missing policies or decision rules with invented requirements. Record required missing materials as unresolved and optional enrichment as optional. If necessary materials remain unavailable, offer an explicit deferral and retain the draft's limitations.

Follow [documents and tools](documents-and-tools.md) for file inspection, formats, provenance, and publication decisions. Keep private source documents outside portable/public packages unless their inclusion is explicitly authorized; the skill can describe how future users supply them.

## Create, validate, and review

Use the current host's available skill-creator guidance. If it is unavailable, create a self-contained skill folder with `SKILL.md`, YAML `name` and `description`, and only the supporting resources this task needs. Reuse an agreed repository/package location; resolve the host and installation scope only when unknown. Check for name/path collisions before writing. Updating an existing skill requires the user's choice and must preserve its unrelated behavior.

Derive the skill from the confirmed task specification: invocation conditions, required and optional inputs, procedure, evidence and uncertainty handling, output contract, completion checks, human handoffs, and external-action boundaries. Map it back to the task ID and specification revision. Keep human decisions with the user. Place reusable instructions in `SKILL.md`, supporting knowledge in `references/`, and templates in `assets/`; add executable scripts only when the task benefits from them. Identify tool/model dependencies accurately and retain unresolved selections for the later tool/model checkpoint.

Validate structure, links, referenced assets, and alignment with the task contract. Exercise a representative example and relevant incomplete-input behavior when feasible with available, authorized data and tools. Use offline checks or mocks for unconnected dependencies and report their limits. Creating the skill does not authorize paid model tests, business actions, or new integrations. Treat proposed changes to the confirmed business behavior as optional targeted specification revisions requiring a user decision.

Show the resulting skill, an example invocation, expected output, verification evidence, and any unresolved dependencies. Obtain review/acceptance or an explicit deferral, apply requested revisions, and provide the portable package and installation guidance for the selected host. Install only within the authorized scope; add publishable skill files to the final exact-file approval checkpoint and artifact manifest.

Record whether the skill is intended for standalone use or proposed reuse by the application. Any application invocation or shared implementation must enter the approved tool/feature plan and receive its own integration evidence. Then resume the agent build at Stage 2, reusing the gathered materials and preserving earlier approvals.
