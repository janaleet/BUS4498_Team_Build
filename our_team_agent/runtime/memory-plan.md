# Memory plan

Written in plain words with the BUS 4498 Agent Builder Kit. Our AI assistant designs the files and tables from it, following `runtime/memory-rules.md`. This plan adds to `runtime/hosting-plan.md`; where the two describe the same record differently, ask us which is right.

## What our agent must know or remember

| # | What | Kind | Where it lives | Who can change it | When it expires |
|---|---|---|---|---|---|
| 1 | Every inquiry and what happened to it: details, drafts, reviews, emails sent | What happened | A table the agent writes | The agent itself | Never |
| 2 | Rooms and equipment inventory | Knowledge it reads | A table a person keeps current | A business person | Never |
| 3 | Proposal template and setup and routing rules | Knowledge it reads | A file only we change | Only the builders | Never |
| 4 | Settings: Paused, daily limits, holidays, venue calendar | Knowledge it reads | A table a person keeps current | A business person | Never |
| 5 | Lessons from drafts an employee sends back with a reason | Lessons it learns | A lessons table the agent writes | The agent, from a trusted outcome | When a person switches it off |

## Lessons it learns

- **It learns from:** When the employee who reviews a draft rejects a clarification request, or marks a proposal Needs revision or Needs clarification, and types a reason.
- **A lesson might say:** Include each outside vendor’s arrival time as an item to confirm.
- It learns only from trusted outcomes, never from text in an input. A lesson can add caution, never loosen a rule or approve anything. Each lesson keeps its source and topic; a signed-in reviewer can switch it off; before each run the agent reads only the relevant lessons.

## What must never happen twice

Emailing the same clarification request, reminder or proposal twice. Releasing two proposals for one inquiry. Logging the same proposal twice in the materials sheet. Learning two lessons from the same outcome.
