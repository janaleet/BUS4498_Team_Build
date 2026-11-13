# Handoff — JEvents Proposals

**Owner, who answers for this agent:** Janalee

## What works now

All six groups are accepted: 1 (intake), 2 (setup needs), 3 (clarification requests), 4 (proposals), 5 (review, revision, lessons, release) and 6 (Gmail, Calendar, Sheets). Google is connected; renew its token weekly (see **Connect Google** below).

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
  - T6 + D3: on the inquiry page a staff member ticks the 5-item quality checklist and chooses Ready for release (only with every box ticked), Needs revision or Needs clarification (each needs a reason). D3 runs in the database: Ready → the proposal is released for download (nothing is sent); Needs revision → T7 (rounds 1 and 2); a third Needs revision → Stopped – coordinator review; Needs clarification → a T2 draft, one question per line of the reason.
  - T7 (Claude Sonnet 5.5): inspects the review, checks it against the client's details, revises only room notes, setup, items to confirm and assumptions, and checks the result — at most 8 AI calls, 10 minutes, 60 s per call, one retry. A conflict with the client's details stops it as Blocked and the question goes to T2; a requested change to the event, room, tables, chairs or AV goes back to a person. Code refuses revised text with prices, contact details, new numbers, or any mention of the review or sources.
  - Lessons (Claude Haiku 5.5): one cautious sentence learned from each Needs revision / Needs clarification reason and each rejected clarification draft. T2, T5 and T7 read at most 10 matching lessons that are on; each draft lists the lessons it applied. Lessons never expire; switch one off on the Lessons page.
  - Dashboard: a proposal waiting more than 10 minutes for review is flagged.
  - Gmail: approving a clarification request or reminder emails it to the approving employee's own inbox; releasing a proposal emails the Word file to the releasing employee. They forward it to the client — the agent never emails a client. Each message is emailed once (database rule), only after the approval or release click, only to staff, at most 20 a day (Settings).
  - Google Calendar (Task 3): the agent reads the venue calendar's free/busy for the event's date and hours. Booked → held for an employee ("date appears booked"); not connected or failed → "Availability not checked – check the calendar by hand" (never treated as free).
  - Google Sheets: each released proposal adds one row (event date, inquiry ID, room, layout, guests, tables, chairs, AV, release date) to the "JEvents materials log" sheet the agent creates the first time. One row per inquiry; no client details.
- **Rooms page:** only a signed-in employee can change rooms (a database rule, `rooms_staff_only`, refuses the agent and anything else); to fix a room by SQL as the owner, disable that trigger for the change.
- **Rooms page (details):** the rooms-and-equipment list the agent reads (starts with the example venue). Every change needs a reason and is recorded.
- **Off switch:** Settings → Paused. While on, the agent does nothing and calls no AI.
- **Report a problem** beside each decision; reports appear in Settings.
- **Test mode:** `dry_run: true` decides as usual and saves nothing.
- Not built: nothing from the plan. Customer access was dropped by team decision (employees only).

## Where things live

| What | Where |
| --- | --- |
| Website | `docs/` (`config.js` holds only the public Project URL and publishable key) |
| The agent | `supabase/functions/agent/` → Supabase → Edge Functions → `agent`. Deploy from the repository root: `supabase login` once, then `supabase functions deploy agent --remote=dfmoialxzwlahvvtgsbu --no-verify-jwt --use-api` |
| Database tables and rules | `supabase/migrations/` (one file per group) |
| Setup rules in code | `supabase/functions/agent/setup.js` (from `our_team_agent/docs/setup-and-routing-rules.md`, sections 4–5) |
| The Skill (BUS4498 Skill Builder) | `our_team_agent/agent/skills/prepare-clarification-request/` — the agent loads its SKILL.md and both files into every clarification draft. After changing it, run `python3 -I supabase/package_skill.py`, then deploy; `tests/skill.test.js` checks the agent's copy matches. |
| Clarification rules in code | `supabase/functions/agent/clarify.js` (layout, deadlines, checks) and `draft.ts` (AI wording) |
| Proposal rules in code | `supabase/functions/agent/proposal.js` (fills and checks), `tailor.ts` (AI wording for T5), `template_docx.ts` (the template, generated from the .docx — regenerate it if the template changes) |
| Review, revision and lessons in code | `supabase/functions/agent/revise.ts` (T7 calls) and `revise.js` (its order, limits and checks), `lessons.ts` and `lesson-rules.js`; D3 is `record_review` in the Group 5 migration |
| Lessons | Website → Lessons (on/off switch with who and when) |
| Proposal files | Supabase → Storage → `proposals` (private; `INQ-0002/v1.docx`, …) |
| Google tools in code | `supabase/functions/agent/google.ts` (calls) and `google.js` (message, free/busy window, log row); database rules in the Group 6 migration (`reserve_email`, `emails`, `materials_log`) |
| Daily clock | Supabase → Integrations → Cron → `clarification-clock` (16:00 UTC = 8–9 AM Pacific) |
| Plans | `our_team_agent/runtime/` |
| Automated checks | `tests/rules.test.js` (intake), `tests/setup.test.js` (setup needs), `tests/clarify.test.js` (clarification requests) |
| Test inquiries | `our_team_agent/docs/sample-inquiries/` and `tests/fixtures/` (made-up, labeled SYNTHETIC) |

Tables (Supabase → Table Editor): `staff_members` (who may sign in), `settings` and `settings_history` (switches, limits, holidays), `inquiries` and `inquiry_submissions` (de-identified inquiries and the six details), `rooms` and `room_changes` (the inventory and its history), `setup_assessments` (one T3 assessment and D2 route per inquiry), `proposals` (each proposal version: sections, changes from the template, who edited it, the file's path; one current draft per inquiry), `proposal_reviews` (one T6 review per proposal version: checklist, outcome, reason, who, when, where D3 sent it), `revision_runs` (one T7 run per review: subtasks, AI calls, time, result), `lessons` (what the agent learned, its source, on/off), `emails` (each message emailed to an employee: what, to whom, when, Gmail id; never twice), `materials_log` and `google_files` (the Sheets log rows and the sheet), `clarification_requests` (each drafted request or reminder, with who approved, rejected, edited and sent it; the database refuses an unapproved or second send), `coordinator_alerts`, `problem_reports`, `ai_usage` (one row per AI call with tokens; the website can't see it).

## Secrets

Names only — values live in Supabase → Edge Functions → Secrets, never in this repository.

- `ANTHROPIC_API_KEY` — the AI key for Claude.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` — the one Google sign-in for Gmail, Calendar and Sheets (scopes `gmail.send`, `calendar.freebusy`, `drive.file`).
- `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` — provided by Supabase automatically.

## Connect Google (once), and renew it weekly

Do this yourself; never paste a secret into chat. Use a personal Gmail account (a Cal Poly account may need an administrator's consent).

1. Go to https://console.cloud.google.com and create a project (for example "JEvents").
2. APIs & Services → Library: turn on **Gmail API**, **Google Calendar API** and **Google Sheets API**.
3. Google Auth Platform (OAuth consent screen): user type **External**; app name "JEvents"; your Gmail as support and developer contact. **Audience**: leave it in **Testing** and add your Gmail as a **test user**. **Data access**: add the scopes `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/calendar.freebusy` and `https://www.googleapis.com/auth/drive.file`.
4. **Clients** → Create client → **Web application**. Under Authorized redirect URIs add `https://developers.google.com/oauthplayground`. Copy the client ID and client secret.
5. Open https://developers.google.com/oauthplayground → gear icon → tick **Use your own OAuth credentials**, paste the client ID and secret, Access type **Offline**. In Step 1 paste the three scope URLs (one per line or space-separated) → **Authorize APIs** → sign in with the test Gmail and allow. In Step 2 click **Exchange authorization code for tokens** and copy the **refresh token**.
6. Supabase → Edge Functions → Secrets: add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN`.
7. Google Calendar (same account): create a calendar such as "JEvents venue" → its Settings → **Integrate calendar** → copy the **Calendar ID**. In JEvents → Settings → "Venue Google Calendar ID", paste it with a reason.
8. JEvents → Settings → Google connection → **Check again** should say Connected.

**Every 7 days** (Testing mode): repeat step 5 and replace `GOOGLE_REFRESH_TOKEN` in Supabase. Until then, Settings shows "Not working", emails and the sheet log fail visibly (with "Email it to me" / "Add to the materials log" to try again), and Task 3 says "Availability not checked".

## How to test

- **Status check:** open https://dfmoialxzwlahvvtgsbu.supabase.co/functions/v1/agent — `ready: true` means the agent can run.
- **Test mode** (saves nothing): POST `{ "dry_run": true, "inquiry": "<inquiry text>" }` to that address with the `apikey` header set to the publishable key. The answer has `status` (`template`, `tailored`, `clarify`, `held`, `paused`, `refused`), `reasons`, `setup`, `clarification` (the draft, for `clarify`), `proposal` (for `template` and `tailored`; add `"include_file": true` to get the .docx as base64), and `review` when you also send `"review": { "outcome": "needs_revision" | "needs_clarification", "comments": "…" }` (the lesson, T7's result, and any T2 draft), `ms`, and `usage`. Test mode is limited to 50 AI calls a day (Settings).
- **On the website:** sign in → New inquiry → paste a sample inquiry → Check for personal details → tick the box → Submit and read with AI. Expected results: `our_team_agent/docs/sample-inquiries/expected-results.md` and `tests/fixtures/expected-results-synthetic.md`.
- **Automated checks** (no install needed on a Mac):
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/rules.test.js`
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/setup.test.js`
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/clarify.test.js`
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/proposal.test.js`
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/review.test.js`
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/google.test.js`
- **Reset:** test mode saves nothing. Inquiries submitted on the website stay (they never expire, per the memory plan).

## Test plan results

`our_team_agent/runtime/test-plan.md` holds the 8 cases (N1–N5, E1–E3). Run on 2026-11-12 in test mode, 3 runs per case: Claude Haiku 5.5 passed 24 of 24 (8.1 s, about $0.004 per case); Claude Sonnet 5.5 passed 24 of 24 (8.7 s, about $0.019 per case). The agent keeps Haiku 5.5 for reading inquiries, sorting requests and drafting clarifications.

## What's next

Set Settings → test runs per day back to 50 and the daily AI limit back to 100 (raised for the test round). Renew the Google token weekly. Write `runtime/test-plan.md` in the Agent Builder Kit once the agent runs.

## How we take turns

Pull before you start, push when you stop, and tell each other first in the group chat ("I'm working on it" / "pushed"). One of us works at a time.
