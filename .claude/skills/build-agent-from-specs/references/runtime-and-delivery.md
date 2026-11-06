# Runtime, credentials, model, and frontend delivery

Use the relevant section when planning tools, configuring a model, or delivering the frontend. Hosting decisions concern the running application, not just where its HTML is served.

Apply runtime and UI work within the current authorized feature group. Resolve model choices and frontend preferences before their first dependent group and reuse them later. Build the controller and shared UI incrementally; scaffolding must not become a reason to implement future groups before approval. Follow [the group checkpoints](staged-build-and-git.md) for demonstration, acceptance and continuation, with original-repository publication after final build review.

## Keep credentials on the server

Ask for configuration, not a secret pasted into the conversation. Suitable routes are a supported secure secret-entry tool, an ignored backend environment file the user fills locally, a credential manager already approved for the project, or the hosting service's secret interface. Request the provider/server and the environment-variable or credential-reference name. A non-secret `.env.example` documents required names without real values.

The backend may load the configured secret for authorized operations. Do not print it, include it in arguments shown to the user, capture it in screenshots, place it in a prompt, or copy it into the skill, build record, public assets, source commits, or export ZIP. Check presence and show a redacted connection result rather than dumping environment variables or provider request/response bodies. Avoid public client variable prefixes for secrets. Inspect repository instructions before touching any explicitly protected credential file.

Use the least access required by the tool plan. Distinguish business API authentication, MCP authentication, model API access, and deployment credentials. A key configured for one service is not permission to use it for another. If the user has already supplied authorized configuration, reuse its reference; do not ask them to re-enter the secret.

If a secret is accidentally exposed, stop propagating it, report that rotation is needed, and replace the configuration through a secure route. Do not include the value in that explanation.

## Model binding and controller

Record model selection per task, including a classifier or trained predictor where chosen, using [model and tool selection](model-and-tool-selection.md). A local model uses a model artifact/repository reference, dependencies and hardware configuration; it may require neither a hosted endpoint nor an API key. Treat the explanation or orchestration model as a separate component when applicable. The controller still owns allowed actions and deterministic calculations.

Verify the selected provider's exact model identifier, supported API, tool-call behavior, structured-output support, and error semantics from current official documentation when implementing the connection. Preserve the chosen provider and task-specific overrides. If a requested combination is unavailable, explain the concrete incompatibility and ask for a substitute; do not silently use a similarly named model.

Model output is an untrusted proposal until the controller validates it. The controller checks the current task, allowed tool name, argument schema, resource scope, budget, and any required human authorization before execution. Tool results return through the same controlled loop. A human-gated task cannot be bypassed by clicking a different UI route or by a model-generated approval field.

Retain run IDs, task statuses, input/evidence versions, tool attempts, safe error categories, and required output records. Apply the specifications' pause/resume semantics. Persist human questions and answers with the correct case and artifact version. Bound loops and propagate cancellation. Do not erase pending work or label a partial write successful.

## Human-question contract

For each human handoff, define and render:

- The affected case or item, what happened, and why this person's input is needed.
- The smallest specific answer or decision needed, using familiar terms and one clear subject per question.
- Appropriate controls, plain-language field labels, required versus optional fields, and an example or format when useful. Use a format example with placeholders, not invented personal facts for the user to copy.
- The evidence or current value being questioned, with a usable source link where available.
- What happens after submission and how unknown, declined, or insufficient answers affect the case. Offer an honest way to say 'I don't know' or 'I can't provide this' without turning it into a positive confirmation.

Keep distinct questions as structured items tied to their case/version, affected fact or decision, answer type, evidence, and next step. Render controls from that structure rather than guessing the question type from keywords or merging unrelated questions into one free-text box.

Route a question to someone who can answer it. Ask the user about their own information or a decision within their authority; ask for a source document/link when an external fact needs evidence. Do not ask them to solve parser errors, supply opaque field names, or certify another party's unknown policy. Technical failures need plain recovery guidance with diagnostics separately available. Separate an evidence response from final approval. Explain validation errors beside the relevant input, retain entered answers, and confirm the saved answer and next step. Test the resulting transition and reload behavior, not only form submission.

## Assessment and recommendation contract

Build the recipient's view around the decision it supports. Lead with a plain-language conclusion and its provisional/final status, then show the main reasons and their evidence, meaningful mismatches, unresolved facts and their consequences, and a specific next action. For comparisons, use consistent criteria and explain tradeoffs. A structured object is a backend contract, not the default human-facing report.

Render the decision-relevant explanation fields the assessment produces; do not discard rationale and show only a result enum or next-action label. Keep the concise summary and supporting detail connected so the reader can understand the conclusion without inspecting raw records.

If the design uses a score, explain its scale, factors/weights, threshold, and treatment of missing data. Do not invent a score or turn uncertainty into unsupported numeric precision. Distinguish a confirmed mismatch from insufficient evidence and an inaccessible source. Keep detailed task traces, internal enums, raw model output, and diagnostics in a secondary view. Preserve evidence links and required export formats. Review realistic normal and uncertain outputs against the intended reader: can they tell what the result means, why, what is unknown, and what to do next?

### Ranked results, evidence, and optional reassessment

For comparative assessment tasks, provide a ranked result view using the approved criteria, with provisional positions or ties when appropriate. Show each item's position or explained unranked status, concise assessment, matching evidence with usable source references, evidence gaps or contradictions, and the practical effect of those gaps. Keep evidence sufficiency visible separately from match strength; a high observed match on sparse evidence does not establish a strong overall recommendation. A single-item assessment needs the explanation and update path without an artificial ranking.

Present useful initial results from available evidence. Missing nonessential data must not turn into a negative finding, silently count as a match, or require a long questionnaire before the user can see any results. Only essential missing evidence or an explicit conflict should block the decision it actually affects under the approved rules. Keep relevant hard constraints visible even when they are rare in the source population. Use claim-level checks to reject unsupported conclusions while preserving the supported portions of a partial result where the design permits.

Offer a discoverable **Add information and reassess** interaction beside the relevant gaps. Let the user choose whether to respond, add supporting text/documents, correct an earlier fact, or leave the result as it is. Follow the human-question contract for answerable prompts and unknown/decline handling. Explain what the new information could change and any applicable run limits or costs. Keep the previous assessment visible while information is drafted or saved; submitting evidence does not automatically confirm its truth, approve an action, or launch unrelated work.

On the user's reassessment request, validate the supplied information, retain its provenance, and apply the approved resume/new-run rule to the affected scope. Save the resulting evidence/assessment versions and show what changed in the conclusion, rank when applicable, and remaining gaps. If broader ordering must be recomputed, define and authorize that scope in the application plan; do not silently rerun discovery, other costly tasks, or downstream actions. Reassessment can complete without generating another artifact or performing a transaction unless the user requested those actions.

The local Internship Prep Agent illustrates this interaction pattern: inspect evidence and gaps, optionally supply a response, and update the selected item's assessment. Carry the pattern into other domains without copying job fields, source sites, fit labels, score scales, ranking quotas, or preparation features. The skill remains usable when that example repository is unavailable.

## Decide where the application runs

| Choice | What must actually work |
| --- | --- |
| Local app on the user's computer | A browser dashboard connects to the local workflow backend and persistent local files/data. Provide a simple platform-appropriate launcher and documented setup, reopen and stop steps; verify operation on the user's platform. Bind to loopback unless broader access is requested. Online model/tool APIs can still be used. |
| Codex Sites UI and hosted runtime | The deployed backend can use the selected platform's supported runtime, persistent storage, secrets, and reachable APIs/MCP transport. Verify the whole hosted path, not only a local preview. |
| Sites UI with a separate runtime | The runtime location, reachable authenticated endpoint, network restrictions, browser access rules, and operating responsibility are explicit and approved. A hosted page cannot simply read the user's disk or reuse a local Codex MCP session. |
| GitHub Pages with browser-only execution | Static HTML/CSS/JavaScript provides the interface and approved browser-side processing. User-selected files, local browser state, and compatible downloads can work; shared private storage, server secrets, and unattended jobs are not supplied by Pages. Verify every required task is feasible in the browser. |
| GitHub Pages with an external backend | Pages serves the interface; separately hosted services provide authenticated model/tool calls, durable shared data, file storage, and scheduled work as needed. Name the services, costs, data boundaries, and responsible operator; test the full hosted path. |

Use [GitHub Pages delivery](github-pages-delivery.md) when that option is considered. Show its feature fit before selection; explain that serving an interactive interface and running a backend are distinct responsibilities. Browser-only control can coordinate local computations, but browser code cannot enforce trusted permissions or shared spending limits for privileged services. Keep those controls in the external backend when required.

### Local delivery contract

Use the local Internship Prep Agent as a delivery-pattern reference: a reusable application the user launches on their own computer, with a browser interface backed by a local controller and local storage. Carry this pattern into other domains without depending on the example repository being available or copying its models, framework, ports, spreadsheet format, schedules, notifications, or job-specific features.

- After one-time setup, provide an easy launcher appropriate to the requested operating system, such as a double-clickable launcher or equivalent, plus terminal start/stop instructions. It should start or reuse the correct application instance, check readiness, open the local dashboard, and explain startup failures plainly. Do not require a native desktop wrapper unless requested.
- The local backend executes the approved workflow and tools, exposes progress/results and human-input controls, and persists the state required by the design. Keep local documents, settings, outputs and runtime history at documented locations; private runtime data stays outside Git. The user can reopen the app and recover the required saved state.
- Keep keys in backend configuration. Describe which operations need internet access, an external API account/key, or another running local service. A local dashboard does not imply a locally hosted model or fully offline execution, and stored local data does not imply that approved API calls send no data externally.
- The completed app should support ordinary use independently of the build conversation. If a proposed runtime needs an active Codex session or another host application, disclose that dependency in the tool/runtime plan and obtain that specific choice. A temporary preview or static demonstration alone does not satisfy local application delivery.
- Choosing local operation means the app runs on the computer; it does not prohibit approved GitHub publication of design/code/shareable documents. An explicit no-publish instruction governs repository publication separately. Local delivery also does not authorize enabling a scheduler or copying other capabilities from the reference app.

### Hosting feasibility and publication

Check file-processing dependencies, long-running tasks, background scheduling, storage durability, model connectivity, MCP transport, and authentication against the selected runtime. A local stdio MCP server needs a process on the local device; it does not become a hosted HTTP service by changing a frontend URL. Do not expose local services, files, or a public tunnel to solve that problem without an explicit approved architecture and access boundary.

If an approved local tool cannot run on the selected host, stop that dependent step and propose an adaptation, separate runtime, or local delivery. Return the changed tool plan to the user before implementing a material change. A static Site with sample data is a valid prototype when requested, but is not a verified live agent backend.

When Codex Sites is selected, discover and read the current installed `sites-building` and `sites-hosting` skills. Use their supported execution profile, project registration/reuse, server/static build, storage, runtime-secret, deployment, and URL verification procedures. Preserve an existing Site's project identity and access settings. Do not hardcode cached plugin paths, framework versions, Cloudflare bindings, or connector schemas from the skill-creation session. At the time of implementation, read only the platform references needed for the selected capabilities.

Selecting Sites establishes the delivery target and authorizes the requested hosting work, subject to the user's feature-review checkpoints and any preview-only limit. Demonstrate the current group before publishing it as accepted functionality; do not let an automatic hosting workflow bypass a pending review. Use existing authorization for deployment of an accepted version, or include deployment explicitly in the checkpoint decision when unresolved. Site publication does not update the original GitHub repository; synchronize and verify the agreed original-repo files at the final GitHub checkpoint. It does not authorize changing an unrelated default branch or expanding the Site's sharing audience. If local-only delivery was selected, do not register or publish a Site.

## Frontend interview and behavior

Collect the user's style, font, animation, and must-have preferences before designing the interface. Include brand/reference files when supplied, and ask about licenses or available font files only when needed to use a chosen asset. Prefer a concise set of choices over an exhaustive design questionnaire. Required functionality comes from the approved task map; do not add a generic dashboard, chatbot, or marketing page simply because a starter includes one.

Translate the feature ledger into the user's main journeys and a screen/interaction plan before filling a starter layout. Show where the user supplies or updates inputs, starts work, follows progress, resolves questions, understands results, prepares outputs, and reviews them when required. Group navigation by recognizable activities. Keep required later-stage features discoverable in an empty or ineligible state with an explanation of their prerequisites; do not hide the only preparation or review route inside an unrelated collapsed detail. Synthetic fixtures do not replace required real-input forms or import routes.

Use a coherent visual system: purposeful type hierarchy, spacing, alignment, restrained colors, consistent components, readable content widths, and clear emphasis on the current result and next action. Match density and terminology to the intended audience. Show full user-facing task names during progress; keep internal IDs available only where useful. Choose reference examples or a concrete design direction when the user delegates aesthetics. Offer the current group's working preview for feedback, refine it, and obtain acceptance before moving to another group. This is the user's requested feature checkpoint; do not add separate approvals for each routine visual adjustment within it.

Represent the actual application states: no input, ready, running, awaiting human input, failed, partial result, completed, and review/approval states when applicable. Show source evidence and next steps near the result they explain. Prevent duplicate submissions while a run is active and enforce permission checks on the server, not only by hiding buttons.

Provide keyboard operation, readable contrast, sensible narrow-screen layout, and reduced-motion behavior even when animation is requested. Use user-facing language for actions; keep debugging traces and tool configuration in a separate appropriate view. Never expose credentials or raw private prompts as a convenience feature.

The first meaningful preview may use labeled synthetic data and mocks. Connect real approved services afterward and update connectivity labels only when verified. Distinguish an output generated from synthetic input using a real model from a live business result using real source data.

Use separate sample and live state. An empty or failed live run must show its actual outcome and a useful next action; never fill it with sample results. Exercise empty, loading, partial, failed, awaiting-input, and completed views using realistic content. Inspect rendered desktop and narrow-screen screenshots for hierarchy, legibility, contrast, spacing, excessive scrolling, clipped content, and obvious actions. A screenshot proves appearance at that state, not functional correctness. A width check alone proves neither usability nor visual quality.
