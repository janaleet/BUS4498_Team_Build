# Permissions and boundaries plan

Written in plain words with the BUS 4498 Agent Builder Kit. Our AI assistant builds it following `runtime/permission-rules.md`. Where this plan and our task specifications disagree, this plan wins.

- Agent: Our system aims to decrease the time it takes an employee to write proposals for clients looking to book their event space. The system takes in requests for proposals and looks into inventory needs to draft a proposal or request more information. (`our_team_agent`)
- Owner, who answers for this agent: Janalee
- Written on: November 13, 2026

## 1. May (on its own)

| # | Action |
|---|---|
| 1 | Read inquiries an employee pastes in |
| 2 | Read the rooms inventory and the venue calendar’s free/busy times |
| 3 | Draft a proposal or a clarification request |
| 4 | Revise a proposal after a reviewer asks |
| 5 | Email an approved or released message to the employee who approved it |
| 6 | Add one row per released proposal to the materials log sheet |
| 7 | Learn a lesson from a reviewer’s typed reason |

## 2. May, with a limit

| # | What | The limit | Kind | Who can change it |
|---|---|---|---|---|
| 1 | AI calls per day | 100, including test mode | A number a reviewer can change in the app | A signed-in reviewer, in the app, with a reason |
| 2 | Test-mode AI calls per day | 50 | A number a reviewer can change in the app | A signed-in reviewer, in the app, with a reason |
| 3 | Emails to employees per day | 20 | A number a reviewer can change in the app | A signed-in reviewer, in the app, with a reason |
| 4 | Revision rounds | 2 per inquiry; a third Needs revision stops for the coordinator | Fixed: only the builders change it | Only the builders, by changing the code |
| 5 | One revision run | At most 8 AI calls and 10 minutes | Fixed: only the builders change it | Only the builders, by changing the code |
| 6 | Lessons read before drafting | At most 10 | Fixed: only the builders change it | Only the builders, by changing the code |
| 7 | Client reply deadline | 3 business days, one reminder on day 2 | Fixed: only the builders change it | Only the builders, by changing the code |
| 8 | AI models | Claude Haiku 5.5 to read, sort and draft clarifications; Claude Sonnet 5.5 for tailored proposals and revisions; either in test mode | Fixed: only the builders change it | Only the builders, by changing the code |

## 3. Ask first (hold for a person)

| # | When | What the agent does instead |
|---|---|---|
| 1 | Emailing anything to a client | Waits for an employee to approve it, then emails it to that employee to forward |
| 2 | A required detail is missing or conflicting | Drafts a clarification request for an employee to approve |
| 3 | The venue calendar shows the date booked | Holds the inquiry, with the reason “date appears booked” |
| 4 | The recommended room is short of tables or chairs | Holds the inquiry for an employee |
| 5 | Personal details can’t be removed from the inquiry | Holds it, and the employee removes them by hand |
| 6 | Text in an inquiry tries to instruct the agent | Flags it for a person and doesn’t follow it |
| 7 | A third Needs revision | Stops for the event coordinator |

## 4. Never

| # | Never | Where it is enforced |
|---|---|---|
| 1 | Email a client | Code and a database rule |
| 2 | Email anything before an employee’s approval or release click | Code and a database rule |
| 3 | Send the same message twice | A database rule |
| 4 | Store a client’s email address or phone number | Code and a database rule |
| 5 | Pick another date, or promise one, when the calendar shows it booked | Code |
| 6 | Change the rooms inventory | A database rule |
| 7 | Put prices, discounts or deposits in a proposal | Code |
| 8 | Release a proposal without every checklist item ticked | Code and a database rule |
| 9 | Approve, release or send anything on its own | Code and a database rule |
| 10 | Act while paused | Code and a database rule |

## 5. Who signs off

| Decision | Who | How |
|---|---|---|
| Sending a clarification request or reminder | Any signed-in employee | Approve, then Mark as sent, on the inquiry page; recorded with who and when |
| Releasing a proposal | The employee reviewing it | Ticks all five checklist items, then Ready for release |
| Changing a setting or a room | Any signed-in employee | Settings or the Rooms page, with a reason |
| Switching a lesson off | Any signed-in employee | The Lessons page |

## The off switch

Any signed-in employee can flip Paused in Settings, with a reason. While paused, the agent does nothing and calls no AI.

## How mistakes are reported

A Report a problem button sits beside each decision; employees read the reports in Settings.

## Rules we keep

- Every permission starts off. The agent may do only what this plan lists under *May* and *May, with a limit*.
- Writing a permission down does not enforce it. Every limit and every *Never* is enforced in code or in a database rule, never in instructions alone.
- A limit a person may change is a setting with an owner and a reason, which the code reads on every run.
- Asking means holding, not guessing: the record waits with a plain reason that names what is missing.
- A sign-off is a click in the app, recorded with who and when. A chat message is not a sign-off.
- Test mode never acts: with `dry_run`, the agent decides but saves nothing.
