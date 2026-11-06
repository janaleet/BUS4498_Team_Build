# Incremental builds and final repository publishing

Read at repository intake to establish destinations, when planning feature groups, and at final publication. Use the existing build record as the shared state for design, implementation, review, and GitHub publication.

## Confirm GitHub readiness before a new build

Before build work begins, ask for the user's confirmation using the current host:

| Host | What the user confirms |
| --- | --- |
| Codex | The GitHub plugin/connection is enabled and authenticated in the active account/workspace, with access to the intended repository. |
| Claude Code | A supported GitHub connection is available to this session, such as a GitHub MCP connection or authenticated Git/GitHub CLI tooling, with access to the intended repository. |

Use one concise question, for example: **“Is your GitHub connection in [Codex / Claude Code] ready for [owner/repository] under the account you intend to use?”** Offer **Ready** and **Need setup help**. If the repository is not yet known, collect its URL with this confirmation. Never request a password or token in chat.

After confirmation, use available read-only tooling to check the authenticated identity when exposed, the intended repository, and the selected source branch/files. Record what was actually verified separately from the user's confirmation. A public page opening, installed plugin, or configured server alone does not prove authenticated repository access. Check permission metadata when available; reading a repository does not prove write permission or that a protected branch accepts pushes. Mark unavailable write-permission evidence **unverified** and resolve the required publication route before publishing. Do not create a test branch, commit, issue, or PR to prove access.

If setup is missing or access fails, explain the specific missing connection or permission and guide the user through the host's current supported setup/sign-in flow. Consult current [OpenAI plugin documentation](https://developers.openai.com/plugins/build/plugins) or [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) when setup instructions are needed. Do not silently install or reconfigure plugins, expand access scopes, or switch accounts/repositories. Wait for the user's confirmation and repeat only the failed read-only check. Independent source inspection and specification summary may proceed when authorized and accessible; implementation may continue against a confirmed local source when GitHub write access is unresolved, but final publication remains pending.

Record an explicit user instruction to omit GitHub publication altogether as an exception; do not require an unused GitHub connection when local sources suffice. Holding source changes locally until final build review is the default, not an exception. For a resumed build, reuse its recorded confirmation and access evidence unless the host/account/workspace/repository changes or an access failure invalidates them. Readiness confirmation never replaces approval of the exact files and destination for a push, PR, merge, or deployment.

## Establish the repository and artifact plan

Record the original design repository, application subfolder, source branch/revision, intended publication branch, and whether delivery uses a branch directly or a pull request. Inspect the current checkout, remotes, repository visibility, and existing folder conventions without exposing credentials embedded in remote URLs. Identify unrelated working-tree changes and unpublished commits before staging or pushing. If write access is unavailable, prepare a local change set and describe the access needed; do not claim publication or silently switch repositories.

Use the existing layout first. Resolve paths relative to the selected application folder in a multi-project repository. Propose the following defaults only when no convention exists:

| Artifact | Usual destination |
| --- | --- |
| User-confirmed system goal, workflow, task specifications, including optional approved revisions | Their original README and `agent/` paths |
| User-supplied context and reference files approved for repository storage | `docs/context/` and `docs/references/`, or the existing `context/` and reference folders |
| Reusable output templates | `templates/` or the existing template folder |
| Optional reusable task skill and approved supporting files | Existing skill-package folder or an agreed `skills/<skill-name>/` path; host installation is tracked separately |
| Standalone tool scripts, CLI helpers, and utilities | `scripts/` with their safe usage instructions |
| Importable tool adapters, controller, API and UI source | Existing application source paths, such as `src/tools/`, `lib/`, or `app/`; do not break imports by moving all code into `scripts/` |
| Relevant tests and labeled synthetic fixtures | `tests/` and `tests/fixtures/` or existing equivalents |
| Dependency manifests/lockfiles and safe configuration examples | Framework-required locations; examples contain variable names, not secrets |
| Final-state development handoff, operating instructions, and publishable acceptance summaries | `docs/development-handoff.md` and existing documentation paths; restrict private operational detail to an authorized location |

Maintain an artifact manifest throughout the build: source/origin, purpose, intended repository-relative path, sensitivity/publication decision, feature group, and local/committed/pushed status. Accumulate accepted files for one final publication review. Include generated files needed to reproduce, run, or maintain the build. Do not include dependency caches, temporary output, live databases, logs, or compiled bundles unless the project's delivery process specifically requires them. Account for omitted artifacts and their storage location; do not silently omit requested files.

Providing a document for use by the agent does not alone approve publishing that document to GitHub. Show the exact proposed files, destination and audience before obtaining publication approval. Reuse explicit authorization that already covers them. For private originals or information unsuitable for that audience, propose a redacted/synthetic version or approved private storage with a safe example/reference in the repo. A branch in a public repository has the repository's visibility. Keep credentials, protected key files, local secret configuration and private runtime records out of commits. Preserve supplied originals; use copies or approved revisions where needed. Keep the full private build record outside published paths and publish only a suitable summary.

## Keep the confirmed specifications as the local build baseline

After the user confirms the specification summary, record the selected source revision or local hashes as the implementation baseline. If the user elected to revise, apply only approved edits, verify the affected handoffs, show the local diff, and add changed files to the final artifact manifest. If the user chose to use the specifications as written, do not edit them or create a correction commit. No GitHub push is needed before building.

Use the confirmed revision or local hashes as the implementation baseline. If the user explicitly prohibits GitHub publication altogether, record that decision; otherwise retain the final publication checkpoint. On resuming, compare source files with the recorded baseline and ask about material changes before dependent work.

## Plan small feature groups

Turn the feature acceptance ledger into an ordered build plan. Each group contains one feature or a few tightly related features that share a meaningful user journey. Give each group its requirement IDs, user-visible outcome, dependencies, required inputs/tools/model access, UI states, acceptance scenarios, and expected files. Cover all requirements without bundling the whole application into one group merely to avoid checkpoints.

A minimal shared foundation can be its own first group with a reviewable result, such as a working shell and saved-input flow. Keep it limited to what the current group needs. Plan future interfaces without implementing future groups early. Planning approval authorizes the named first group, not completion of every group. Obtain approval of the group order and first group's scope before implementation.

Within each group, implement the necessary tool, controller, persistence, and UI pieces together so the user can test the outcome. Offer and confirm task-specific model choices and gather UI preferences before the first group that depends on them, then reuse those confirmed choices. A model named in the specifications is included in the student's choice rather than applied automatically. Do not build every tool and the complete backend before presenting the first feature. Use approved sample modes when a live dependency is unavailable; label remaining gaps and do not present a mock as a finished live feature.

## Review and accept each group before advancing

For the current group:

1. Implement only its approved scope and necessary shared support. Run its meaningful acceptance checks and the affected regression checks for earlier accepted features.
2. Present a working preview or appropriate artifact, changes by requirement/file, test evidence, remaining limitations, and the files added to the accumulated manifest. Identify the next group's proposed scope.
3. Ask for the user's decision. Distinguish **accept this version** from **continue to the named next group**. A clear answer can cover both. Do not ask for GitHub publication at this group checkpoint unless the user explicitly requested an earlier push.
4. If revisions are requested, fix and recheck this group, then present the revised version. Do not implement the next group, including through a subagent, while this checkpoint is pending. Read-only planning and preserving work are permitted.
5. Once accepted, record the reviewed version, user decision, local file/revision state, and manifest entries. Advance when continuation to the next group is authorized. Keep original-repository publication pending until final build review; an unpushed accepted group does not block the next group.

A concise combined question is: 'Approve Group G1 as shown and continue with Group G2 [specific outcome]?' Allow the user to revise the group or accept it while pausing. A clear 'Approved' to that question covers its stated acceptance and continuation scope; it does not authorize GitHub publication.

Context/reference documents, generated templates, tools, app source, tests and operating files enter the artifact manifest as they are prepared. Newly provided documents get an explicit storage/publication disposition. Keep these changes local until the complete build has passed final review, then present the accumulated exact change set once for GitHub approval. If the user explicitly asks for an earlier push, review and approve that separate scope before publishing it.

If the user requests a specification change during a group, pause only the affected work, agree on the changed behavior, update and verify the relevant source files, and add them to the final publication manifest. Do not start a general audit of unrelated specifications. Routine fixes that realize confirmed behavior remain inside the current group. Later changes to an accepted group invalidate only the affected acceptance evidence and require review of the revised behavior before dependent work proceeds. Keep unrelated approvals intact.

## Final GitHub publication: commit, push and verify the exact change set

After all groups and final verification, present the complete artifact manifest, exact accumulated diff, destination, audience, and any deployment triggered by pushing. Obtain the user's approval for that final GitHub publication unless it was already explicitly given for the same scope. Before publication, check that the reviewed source/diff and file manifest still match that approval, and inspect the latest remote state. Review the outgoing commit range as well as the working-tree diff: pushing a branch can publish earlier unreviewed commits. Use an isolated branch or checkout when necessary to exclude unrelated work. Preserve the user's changes; do not reset, overwrite, or force-push to resolve a mismatch.

For GitHub Pages, check whether a push to the selected branch triggers deployment. Include that effect and the published audience in the approval scope, or keep unapproved work outside the deployment trigger. Follow [GitHub Pages delivery](github-pages-delivery.md) for the static artifact and separate backend; a source push, Pages deployment, and backend deployment each need their own verification.

Stage only the approved paths and inspect the staged diff, including file additions/deletions and appropriate binary-file review. Do not sweep unrelated existing staged changes into the commit. Commit the coherent reviewed change set and push to the approved remote/branch using supported Git or GitHub tooling. Respect branch protections. If a pull request is the agreed route, create/update it, attach it to the task using the available artifact tool, and report pushed/proposed status accurately; merging is a separate action requiring authorization.

After pushing, verify that the intended commit is present on the intended remote branch and that the expected files/content are available at that revision. Record the commit SHA, branch/PR link, published paths, and any deliberate exclusions. A commit in a temporary folder, ZIP, local Git history, or GitHub API response without read-back is not a verified repository update. If interrupted, check remote state before retrying so an already completed push is not misreported or duplicated. For authentication, permission or conflict failures, retain the local change set and report the specific unresolved action; do not mark publication complete.

## Keep original and hosting repositories distinct

A Codex Site may have a separate managed source repository and deployment history. Record its identity and mapping to the original GitHub repository. Publishing the Site does not update the original design repo, and pushing the original repo does not deploy the Site. At final GitHub publication, synchronize approved design, documents, scripts and reproducible app source to their agreed original-repo paths; use the current Sites workflow for its own source and deployment operations. Avoid copying hosting-private credentials or metadata to the original repo. Verify each requested destination separately and report design/source push, PR merge, and live deployment as distinct states.
