# Setup and Routing Rules

> **Example data.** Replace the rooms, formulas, and template list with your venue's real rules before building.

These rules drive T1, D1, T3, and D2. The app reads this file as context, so keep the headings and numbers in this format.

## 1. Required inquiry fields

D1 needs all six fields to be **found** and none to be **conflicting**.

| Field | Accepted format | Example |
| --- | --- | --- |
| Event type | One value from the event type list in section 5 or a short description | Corporate meeting |
| Event date | A single calendar date | 2027-03-11 |
| Start time | Clock time | 9:00 AM |
| End time | Clock time, later than the start time | 3:00 PM |
| Guest count | One whole number (a range such as "30–50" counts as **conflicting**) | 45 |
| Preferred layout | Theater, classroom, banquet, reception, or boardroom | Classroom |

Optional fields (recorded if present, never required): room preference, AV requests, catering, special requests, budget.

## 2. Personal details removed at intake

T1's `remove_personal_details` tool removes these before anything is saved or sent to the AI model, replacing each with a placeholder:

| Personal detail | Placeholder |
| --- | --- |
| Client or guest names | [NAME] |
| Email addresses | [EMAIL] |
| Phone numbers | [PHONE] |
| Street addresses | [ADDRESS] |

The client's company or organization name may stay, because it is needed for the proposal and is not personal information.

## 3. D1 · Sufficient event details?

- **Details sufficient → T3:** all six required fields are found and none conflict.
- **Details missing → T2:** any required field is missing or conflicting.

## 4. Room selection and setup formulas (T3)

**Room:** choose the smallest room in `rooms-and-equipment.csv` whose capacity for the requested layout is at least the guest count. A capacity of 0 means that layout is not offered in that room. If the client names a room that is too small, recommend the smallest room that fits and list the request under unresolved items.

**Tables and chairs by layout** (round all results up):

| Layout | Tables | Chairs |
| --- | --- | --- |
| Theater | 0 (plus 1 presenter table) | Guest count |
| Classroom | Guest count ÷ 2 six-foot tables (plus 1 presenter table) | Guest count |
| Banquet | Guest count ÷ 8 sixty-inch round tables | Guest count |
| Reception | Guest count ÷ 10 cocktail tables | Guest count × 0.3 |
| Boardroom | Fixed boardroom table | Guest count |

**Always add:** 1 registration table for events over 50 guests; 1 food and beverage table if catering is requested.

**AV by event type:**

| Event type | Standard AV |
| --- | --- |
| Corporate meeting | 1 projector, 1 screen |
| Conference or training | 1 projector, 1 screen, 1 wireless mic |
| Birthday party | Speaker system |
| Holiday party | Speaker system, 1 wireless mic |
| Baby or bridal shower | Speaker system |
| Any event over 100 guests | Add 1 wireless mic and the room's speaker system |

If a requested AV item is not available in the chosen room, mark it **unknown** and list it under unresolved items.

## 5. D2 · Use template?

**Template event types:** corporate meeting, conference or training, birthday party, holiday party, baby or bridal shower.

**Not on the template list (always tailored):** wedding reception, gala or fundraiser, concert or performance, trade show, multi-day event.

**Special requests** are anything not covered by section 4's formulas, for example a stage, dance floor, livestream, outside vendors, installed décor, or an end time after 11:00 PM.

- **Template suitable → T4:** the event type is on the template list, **and** the guest count fits a standard layout of the recommended room, **and** there are no special requests.
- **Tailoring needed → T5:** any one of those three checks fails.
