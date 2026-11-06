# GitHub Pages delivery

Read when GitHub Pages (`github.io`, or a custom domain) is proposed or selected. It hosts static HTML, CSS, and JavaScript; browser interactions can be dynamic, while a server runtime must be supplied elsewhere. Use the current [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) and [limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) to check plan eligibility, audience, quotas, and permitted use. Documentation checked for this reference on 2026-09-28; recheck when implementing. Do not promise that Pages alone supports every agent feature.

## Explain the two routes before selection

| Required feature | Pages with browser-only execution | Additional service when needed |
| --- | --- | --- |
| Dashboard, forms, navigation, result views and interactive cards | Supported through browser code | None for these interface behaviors alone |
| User-selected documents and generated downloads | Possible with compatible browser parsers/generators; verify formats, file sizes and device performance | Backend processing for unsupported/heavy formats; file storage for durable uploads |
| Saved preferences, drafts or history on one device | Possible with browser storage, subject to browser clearing, quota and availability | Authenticated database/storage for durable shared or cross-device records |
| AI inference, classification and assessment | Only if the selected model genuinely runs in the browser or uses an appropriate browser-safe access route | An authenticated server-side model gateway for ordinary secret-key API calls |
| Live search and business APIs | Direct calls only where the provider permits the browser origin and requires no confidential credential | Backend/tool adapter for secret-key APIs, server processing and supported source retrieval |
| Accounts and private user data | Pages supplies no application auth/database service; the static interface is usually public | Appropriate identity provider, backend authorization, and private storage; provider-hosted sign-in when applicable |
| Daily/weekly execution, background work, or automatic email | A browser tab cannot provide reliable unattended execution | Approved scheduler/worker and email integration, operating independently of the page |

These are architecture choices, not guarantees for every library or provider. Consult [browser file handling](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications), [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), and [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) when relevant. Distinguish selecting a file for local processing from uploading it to a server. Browser storage does not imply cloud synchronization or automatic writes to a user's local spreadsheet; provide exports or an explicitly supported file-access workflow.

For a workflow needing server capabilities, propose **GitHub Pages frontend + external backend** and name the backend, storage, authentication, scheduler, operator, setup burden and cost conditions. Reuse approved services. If the user wants Pages alone, assess the full task contract: obtain an explicit scope change or use another host when a required feature is unsupported. Preserve functioning browser-only features without labeling mocked or unconnected inference as a completed agent.

### Explain an external backend in plain language

An external backend is a service hosted separately from the Pages website that executes private operations and stores shared data. It can be managed server functions; users need not administer a traditional server. A concrete candidate is **GitHub Pages + Supabase**, when the selected tasks fit its documented runtime:

- Pages displays the forms, progress, results and downloads.
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) execute authenticated workflow/model/tool requests with server-side secrets.
- The database and [file storage](https://supabase.com/docs/guides/storage) hold appropriately protected state and documents.
- A configured [scheduler](https://supabase.com/docs/guides/functions/schedule-functions) can invoke functions for approved recurring work; email still needs an authorized provider integration.

This is an example to compare with the user's existing services, not a required vendor or an automatic account choice. Check function duration, memory, dependencies, queues and costs for the intended workload. Resolve student-owned versus instructor-managed access explicitly. Changing the frontend host may require a different sign-in integration, callback configuration, and deployment setup; do not assume a Sites identity session transfers to Pages.

## Runtime and data boundaries

- Publish only intended public frontend assets. Keep private records, uploaded documents, provider keys, privileged service credentials, and email refresh tokens out of the repository and deployed bundle. A GitHub Actions secret used during a build becomes public if inserted into browser JavaScript; build-time substitution is not runtime secret storage.
- Put privileged calls behind an authenticated backend that validates users, resources, inputs and permitted operations, and enforces budgets/rate limits. CORS governs browser access and does not replace authentication. Public client configuration is acceptable only where the provider explicitly designs it for client use with enforced access controls. Never solve a CORS or source-access failure with an unapproved public proxy or a credential in the frontend.
- Verify the backend's allowed origins and any OAuth callback against the actual Pages URL, including a project's repository path. Source-repository privacy does not alone make the published site private. Check the actual published audience and the provider's supported authentication flow.
- Check GitHub's current use restrictions for the actual project. Pages is not offered for running a commercial SaaS/e-commerce business, and GitHub advises against sensitive transactions such as submitting passwords or credit card numbers. Choose a suitable authenticated service/host for such flows. Apply any special educational-copy conditions only to that kind of project; an ordinary original classroom project is a different case.
- Treat GitHub Actions separately from Pages. Actions may be an approved batch scheduler, but it is not a continuously available application backend. [Scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) can be delayed or dropped and public-repository schedules can be disabled after inactivity. If selected, define timezone, authorization, secret storage, bounded retries, durable status and duplicate prevention; explain reliability limits. Do not add or enable a schedule merely because Pages was selected.

## Build, publish and verify

1. Record the repository, user/organization site or project-site URL, base path, and existing Pages configuration. Inspect any active deployment before modifying it. Select static output or a framework's supported static export; Pages does not run server routes or server-side rendering for the application.
2. Prepare the approved feature group. Use paths that work under `/<repository>/` for a project site. Choose and test a compatible routing approach, such as hash routing or generated static pages, including refresh on a direct link. Verify output formats and explain local-versus-server data handling in the UI where it affects user choices.
3. Prepare the [publishing source or workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). Review feature groups through a local preview until the complete build is accepted. At final publication, present the exact artifact, repository/branch, audience, and any push-triggered deployment. Reuse approval covering that scope; otherwise obtain final GitHub/Pages publication approval before enabling Pages or deploying. Do not change repository visibility to obtain hosting without authorization.
4. Inspect the compiled artifact, including generated data and source maps, for secrets and private content. After authorized deployment, verify the served version, base-path assets, navigation, responsive interface, and required real browser-to-backend behavior. Test relevant unauthorized-access, failure, persistence, and user-isolation cases within the approved test scope. Record frontend and backend deployment/verification separately.
5. Hand off the live URL, any separate service dependencies, safe update steps, operating responsibility, and remaining limits. If only the interface is working, identify the incomplete feature groups rather than calling the full build complete.
