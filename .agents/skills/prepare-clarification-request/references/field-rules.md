# Field rules for clarification requests

Copied from `our_team_agent/docs/setup-and-routing-rules.md` (sections 1, 2 and 4) at commit `b298352`. That file is marked as example data; if the venue's real rules change, the repository file wins — update this copy to match.

## The six required fields

D1 needs all six **found** and none **conflicting**. Anything else goes to T2 as an unresolved issue.

| Field | A usable answer | Example | Counts as conflicting |
| --- | --- | --- | --- |
| Event type | One type, or a short description | Corporate meeting | Two different types mentioned |
| Event date | A single calendar date | 2027-03-11 | "Late April", a range of days, two dates |
| Start time | A clock time | 9:00 AM | "Morning", two times |
| End time | A clock time later than the start time | 3:00 PM | Earlier than the start time |
| Guest count | One whole number | 45 | A range such as "30–50" |
| Preferred layout | Theater, classroom, banquet, reception, or boardroom | Classroom | Two layouts, or a style that isn't one of the five |

Optional fields (recorded if present, never required): room preference, AV requests, catering, special requests, budget. Ask about these only when a reviewer or the setup check flagged them.

## Issues that come from later tasks

| From | Typical issue | What to ask |
| --- | --- | --- |
| T3 Identify setup needs | No room fits the guest count in the requested layout | State the largest capacity the finding gives, and ask how the client would like to proceed (a smaller count, or another layout only if the finding shows one fits) |
| T3 | A requested AV item isn't available in the room, or is *unknown* (not in any room's inventory, so the venue can't confirm it) | How important it is to the event, and whether the client plans to bring it or can do without it; don't promise the venue can supply or allow it |
| T3 | The client named a room that is too small | Whether the recommended larger room is acceptable |
| T6 Human review | Reviewer chose *Needs clarification* and named the gap | The reviewer's question, in plain client-facing words |
| T7 Revise packet | Two sources disagree (review says 120 guests, inquiry says 80) | Which value is right — "our notes show two different numbers"; never mention reviewers or revisions, or whose mistake it was |

## Personal details that never go in the draft

| Detail | Placeholder |
| --- | --- |
| Client or guest names | [NAME] in source text; [CLIENT NAME] in the greeting |
| Email addresses | [EMAIL] |
| Phone numbers | [PHONE] |
| Street addresses | [ADDRESS] |

The client's company or organization name may stay.

## Deadline

3 business days (Monday–Friday, excluding holidays) from the day the request is prepared. One reminder is sent on business day 2. Use `python3 -I scripts/clarify_tools.py deadline` for the date.
