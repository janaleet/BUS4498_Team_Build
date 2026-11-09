# Handoff — JEvents Proposals

**Owner, who answers for this agent:** Janalee

## What works now

Groups 1 (intake), 2 (setup needs) and 3 (clarification requests) are accepted. Group 4 (proposals) is built and live in Supabase; its website card is waiting for a push and a walkthrough.

- **Website** (GitHub Pages, from the `docs/` folder): https://janaleet.github.io/BUS4498_Team_Build/ — sign-in, Dashboard, New inquiry (paste only), one page per inquiry, Rooms, Settings.
- **The agent** (Edge Function `agent`):
  - T1: removes personal details, reads the six required event details with AI (Claude Haiku 5.5).
  - D1: details missing → Task 2.
  - T3: picks the smallest room that fits, works out tables, chairs and AV from the rules, and has the AI (Haiku 5.5) sort the client's AV and special requests.
  - D2: template (Task 4) or tailored (Task 5); no room fits or an unknown item → Task 2; a table or chair shortage → held for an employee.
  - T2: the AI (Haiku 5.5) drafts a clarification request (inquiry ID, numbered questions quoting the client, a reply-by date 3 business days out, no personal details). An employee may edit it, then approves or rejects it (with a reason; Redraft writes a new one), sends it from their own email, and clicks Mark as sent. The client's reply is pasted under the same inquiry ID and goes back through T1. A daily job drafts one reminder on business day 2 and marks the inquiry Stopped – no response after the reply-by date.
  - T4: fills the approved Word template (`our_team_agent/docs/proposal-template.docx`) by code, no AI. An empty value shows [TO CONFIRM] and is listed under Items to Confirm. If the template can't be filled, the inquiry goes to T5.
  - T5: code fills the standard sections; the AI (Claude Sonnet 5.5) writes only the room notes, setup requirements, extra items to confirm and assumptions, plus a list of each change from the template with its D2 reason (shown to reviewers only). Code refuses AI text with a price, contact details or a number not in the inquiry; then the tailored sections say "[TO CONFIRM – write by hand]" and the coordinator is told.
  - Each proposal is saved as a new version (.docx in the private `proposals` storage bucket); earlier versions are kept. On the inquiry page an employee can download it, read the sections, and edit the tailored sections by hand, which saves a new version. Review (T6) comes in Group 5.
- **Rooms page:** the rooms-and-equipment list the agent reads (starts with the example venue). Every change needs a reason and is recorded.
- **Off switch:** Settings → Paused. While on, the agent does nothing and calls no AI.
- **Report a problem** beside each decision; reports appear in Settings.
- **Test mode:** `dry_run: true` decides as usual and saves nothing.
- Not built yet: Tasks 6–7, lessons, Gmail, Google Calendar, Google Sheets (Groups 5–6).

## Where things live

| What | Where |
| --- | --- |
| Website | `docs/` (`config.js` holds only the public Project URL and publishable key) |
| The agent | `supabase/functions/agent/` → Supabase → Edge Functions → `agent` |
| Database tables and rules | `supabase/migrations/` (one file per group) |
| Setup rules in code | `supabase/functions/agent/setup.js` (from `our_team_agent/docs/setup-and-routing-rules.md`, sections 4–5) |
| Clarification rules in code | `supabase/functions/agent/clarify.js` (layout, deadlines, checks) and `draft.ts` (AI wording) |
| Proposal rules in code | `supabase/functions/agent/proposal.js` (fills and checks), `tailor.ts` (AI wording for T5), `template_docx.ts` (the template, generated from the .docx — regenerate it if the template changes) |
| Proposal files | Supabase → Storage → `proposals` (private; `INQ-0002/v1.docx`, …) |
| Daily clock | Supabase → Integrations → Cron → `clarification-clock` (16:00 UTC = 8–9 AM Pacific) |
| Plans | `our_team_agent/runtime/` |
| Automated checks | `tests/rules.test.js` (intake), `tests/setup.test.js` (setup needs), `tests/clarify.test.js` (clarification requests) |
| Test inquiries | `our_team_agent/docs/sample-inquiries/` and `tests/fixtures/` (made-up, labeled SYNTHETIC) |

Tables (Supabase → Table Editor): `staff_members` (who may sign in), `settings` and `settings_history` (switches, limits, holidays), `inquiries` and `inquiry_submissions` (de-identified inquiries and the six details), `rooms` and `room_changes` (the inventory and its history), `setup_assessments` (one T3 assessment and D2 route per inquiry), `proposals` (each proposal version: sections, changes from the template, who edited it, the file's path; one current draft per inquiry), `clarification_requests` (each drafted request or reminder, with who approved, rejected, edited and sent it; the database refuses an unapproved or second send), `coordinator_alerts`, `problem_reports`, `ai_usage` (one row per AI call with tokens; the website can't see it).

## Secrets

Names only — values live in Supabase → Edge Functions → Secrets, never in this repository.

- `ANTHROPIC_API_KEY` — the AI key for Claude.
- `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` — provided by Supabase automatically.

## How to test

- **Status check:** open https://dfmoialxzwlahvvtgsbu.supabase.co/functions/v1/agent — `ready: true` means the agent can run.
- **Test mode** (saves nothing): POST `{ "dry_run": true, "inquiry": "<inquiry text>" }` to that address with the `apikey` header set to the publishable key. The answer has `status` (`template`, `tailored`, `clarify`, `held`, `paused`, `refused`), `reasons`, `setup`, `clarification` (the draft, for `clarify`), `proposal` (for `template` and `tailored`; add `"include_file": true` to get the .docx as base64), `ms`, and `usage`. Test mode is limited to 50 AI calls a day (Settings).
- **On the website:** sign in → New inquiry → paste a sample inquiry → Check for personal details → tick the box → Submit and read with AI. Expected results: `our_team_agent/docs/sample-inquiries/expected-results.md` and `tests/fixtures/expected-results-synthetic.md`.
- **Automated checks** (no install needed on a Mac):
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/rules.test.js`
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/setup.test.js`
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/clarify.test.js`
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/proposal.test.js`
- **Reset:** test mode saves nothing. Inquiries submitted on the website stay (they never expire, per the memory plan).

## What's next

Group 5: Task 6 review and D3 sign-off, Task 7 revision, lessons, release download. Then Group 6 (Gmail, Calendar, Sheets). Write `runtime/test-plan.md` in the Agent Builder Kit once the agent runs.

## How we take turns

Pull before you start, push when you stop, and tell each other first in the group chat ("I'm working on it" / "pushed"). One of us works at a time.
