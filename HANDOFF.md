# Handoff — JEvents Proposals

**Owner, who answers for this agent:** Janalee

## What works now

Group 1 (foundation and intake) is accepted. Group 2 (setup needs) is built and live in Supabase; its website pages are waiting for a push and a walkthrough.

- **Website** (GitHub Pages, from the `docs/` folder): https://janaleet.github.io/BUS4498_Team_Build/ — sign-in, Dashboard, New inquiry (paste only), one page per inquiry, Rooms, Settings.
- **The agent** (Edge Function `agent`):
  - T1: removes personal details, reads the six required event details with AI (Claude Haiku 5.5).
  - D1: details missing → Task 2 (clarification request, coming in Group 3).
  - T3: picks the smallest room that fits, works out tables, chairs and AV from the rules, and has the AI (Haiku 5.5) sort the client's AV and special requests.
  - D2: template (Task 4) or tailored (Task 5); no room fits or an unknown item → Task 2; a table or chair shortage → held for an employee.
- **Rooms page:** the rooms-and-equipment list the agent reads (starts with the example venue). Every change needs a reason and is recorded.
- **Off switch:** Settings → Paused. While on, the agent does nothing and calls no AI.
- **Report a problem** beside each decision; reports appear in Settings.
- **Test mode:** `dry_run: true` decides as usual and saves nothing.
- Not built yet: Tasks 2, 4–7, Gmail, Google Calendar, Google Sheets (Groups 3–6).

## Where things live

| What | Where |
| --- | --- |
| Website | `docs/` (`config.js` holds only the public Project URL and publishable key) |
| The agent | `supabase/functions/agent/` → Supabase → Edge Functions → `agent` |
| Database tables and rules | `supabase/migrations/` (Group 1 and Group 2 files) |
| Setup rules in code | `supabase/functions/agent/setup.js` (from `our_team_agent/docs/setup-and-routing-rules.md`, sections 4–5) |
| Plans | `our_team_agent/runtime/` |
| Automated checks | `tests/rules.test.js` (intake) and `tests/setup.test.js` (setup needs) |
| Test inquiries | `our_team_agent/docs/sample-inquiries/` and `tests/fixtures/` (made-up, labeled SYNTHETIC) |

Tables (Supabase → Table Editor): `staff_members` (who may sign in), `settings` and `settings_history` (switches, limits, holidays), `inquiries` and `inquiry_submissions` (de-identified inquiries and the six details), `rooms` and `room_changes` (the inventory and its history), `setup_assessments` (one T3 assessment and D2 route per inquiry), `coordinator_alerts`, `problem_reports`, `ai_usage` (one row per AI call with tokens; the website can't see it).

## Secrets

Names only — values live in Supabase → Edge Functions → Secrets, never in this repository.

- `ANTHROPIC_API_KEY` — the AI key for Claude.
- `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` — provided by Supabase automatically.

## How to test

- **Status check:** open https://dfmoialxzwlahvvtgsbu.supabase.co/functions/v1/agent — `ready: true` means the agent can run.
- **Test mode** (saves nothing): POST `{ "dry_run": true, "inquiry": "<inquiry text>" }` to that address with the `apikey` header set to the publishable key. The answer has `status` (`template`, `tailored`, `clarify`, `held`, `paused`, `refused`), `reasons`, `setup`, `ms`, and `usage`. Test mode is limited to 50 AI calls a day (Settings).
- **On the website:** sign in → New inquiry → paste a sample inquiry → Check for personal details → tick the box → Submit and read with AI. Expected results: `our_team_agent/docs/sample-inquiries/expected-results.md` and `tests/fixtures/expected-results-synthetic.md`.
- **Automated checks** (no install needed on a Mac):
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/rules.test.js`
  - `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/setup.test.js`
- **Reset:** test mode saves nothing. Inquiries submitted on the website stay (they never expire, per the memory plan).

## What's next

Group 3: Task 2 clarification requests (draft, employee approval, client reply under the same inquiry ID, day-2 reminder, 3-day no-reply stop). Then Group 4 (proposals), Group 5 (review and revision), Group 6 (Gmail, Calendar, Sheets). Write `runtime/test-plan.md` in the Agent Builder Kit once the agent runs.

## How we take turns

Pull before you start, push when you stop, and tell each other first in the group chat ("I'm working on it" / "pushed"). One of us works at a time.
