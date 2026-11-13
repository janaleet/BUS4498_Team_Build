# Hosting plan

Written in plain words with the BUS 4498 Agent Builder Kit. Our AI assistant turns it into a GitHub Pages website and a Supabase backend, following `runtime/hosting-rules.md`. Where this plan and our task specifications disagree, this plan wins.

## Our project

- GitHub repository: https://github.com/janaleet/BUS4498_Team_Build
- Our agent’s folder: `our_team_agent` (our plans are in `our_team_agent/runtime/`)
- Supabase project: https://dfmoialxzwlahvvtgsbu.supabase.co
- Owner of the repository and the Supabase project: Janalee
- Teammate: Jackson, a collaborator on GitHub and a Developer in the Supabase organization
- We say “I’m working on it” and “pushed” in: Group chat. One of us works at a time.

## What our agent does

Our system aims to decrease the time it takes an employee to write proposals for clients looking to book their event space. The system takes in requests for proposals and looks into inventory needs to draft a proposal or request more information.

## Our tasks

Use the tasks in our task specifications: `our_team_agent/agent/workflow-of-tasks.md` and `our_team_agent/agent/task-specs/`.

## Who can see or change what

Only signed-in employees on the staff list use the app. They see every inquiry, draft, review and lesson, and they approve or release anything meant for a client. Clients never sign in; they receive only what an employee forwards.

## External tools and applications

| # | Tool or application | What the agent uses it for | What it does with it | Most sensitive data it touches | How it connects |
|---|---|---|---|---|---|
| 1 | Gmail | Emails an approved clarification request, or a released proposal, to the employee who approved it. The employee forwards it to the client; the agent never emails a client. | Sends with it | Internal | A sign-in (OAuth) |
| 2 | Google Calendar | Reads the venue calendar’s free/busy times for the event’s date and hours; a booked date is held for an employee. | Reads from it | Internal | A sign-in (OAuth) |
| 3 | Google Sheets | Adds one row per released proposal to a materials log: event date, room, tables, chairs, AV. No client details. | Writes to it | Internal | A sign-in (OAuth) |

## Files people upload

None.
