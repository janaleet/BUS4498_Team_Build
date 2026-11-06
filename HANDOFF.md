# Handoff — JEvents Proposals

**Owner, who answers for this agent:** Janalee

## What works now

Group 1 (foundation and intake) is built and live in Supabase. It is not yet tested end to end through the website.

- **Website** (GitHub Pages, from the `docs/` folder): sign-in, Dashboard, New inquiry (paste only), one page per inquiry, Settings. Link once Pages is on: https://janaleet.github.io/BUS4498_Team_Build/
- **The agent** (Edge Function `agent`): removes personal details, reads the six required event details with AI (Claude Haiku 5.5), and decides D1 (details sufficient → Task 3; missing → Task 2). If the AI can't read an inquiry, it is held and an employee types the details in.
- **Off switch:** Settings → Paused. While on, the agent does nothing and calls no AI.
- **Report a problem** beside each D1 decision; reports appear in Settings.
- **Test mode:** `dry_run: true` decides as usual and saves nothing.
- Not built yet: Tasks 2–7, Gmail, Google Calendar, Google Sheets (Groups 2–6).

## Where things live

| What | Where |
| --- | --- |
| Website | `docs/` (`config.js` holds only the public Project URL and publishable key) |
| The agent | `supabase/functions/agent/` → Supabase → Edge Functions → `agent` |
| Database tables and rules | `supabase/migrations/20261106204620_group1_foundation_intake.sql` |
| Plans | `our_team_agent/runtime/` |
| Automated rule checks | `tests/rules.test.js` (run with the command under How to test) |
| Test inquiries | `our_team_agent/docs/sample-inquiries/` and `tests/fixtures/` (made-up, labeled SYNTHETIC) |

Tables (Supabase → Table Editor): `staff_members` (who may sign in), `settings` and `settings_history` (switches, limits, holidays; every change has a reason, who and when), `inquiries` and `inquiry_submissions` (de-identified inquiries and the six details), `coordinator_alerts`, `problem_reports`, `ai_usage` (one row per AI call with tokens; the website can't see it).

## Secrets

Names only — values live in Supabase → Edge Functions → Secrets, never in this repository.

- `ANTHROPIC_API_KEY` — the AI key for Claude.
- `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` — provided by Supabase automatically.

## How to test

- **Status check:** open https://dfmoialxzwlahvvtgsbu.supabase.co/functions/v1/agent — `ready: true` means the agent can run.
- **Test mode** (saves nothing): POST `{ "dry_run": true, "inquiry": "<inquiry text>" }` to that address with the `apikey` header set to the publishable key. The answer has `status` (`sufficient`, `missing`, `held`, `paused`, `refused`), `reasons`, `ms`, and `usage`.
- **On the website:** sign in → New inquiry → paste a sample inquiry → Check for personal details → tick the box → Submit and read with AI. Expected results: `our_team_agent/docs/sample-inquiries/expected-results.md` and `tests/fixtures/expected-results-synthetic.md`.
- **Rule checks** (no install needed on a Mac): `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/rules.test.js`
- **Reset:** test mode saves nothing. Inquiries submitted on the website stay (they never expire, per the memory plan).

## What's next

Group 2: Task 3 setup needs and D2 (rooms-and-equipment table and an edit page). Then Group 3 (Task 2 clarification requests), Group 4 (proposals), Group 5 (review and revision), Group 6 (Gmail, Calendar, Sheets). Write `runtime/test-plan.md` in the Agent Builder Kit once the agent runs.

## How we take turns

Pull before you start, push when you stop, and tell each other first in the group chat ("I'm working on it" / "pushed"). One of us works at a time.
