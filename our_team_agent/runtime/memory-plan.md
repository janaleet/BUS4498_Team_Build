# Memory plan

Written in plain words with the BUS 4498 Agent Builder Kit. Our AI assistant designs the files and tables from it, following `runtime/memory-rules.md`. This plan adds to `runtime/hosting-plan.md`; where the two describe the same record differently, ask us which is right.

## What our agent must know or remember

| # | What | Kind | Where it lives | Who can change it | When it expires |
|---|---|---|---|---|---|
| 1 | Every request it receives | Knowledge it reads | A table the agent writes | The agent itself | Never |
| 2 | Inventory | Knowledge it reads | A table a person keeps current | The agent itself | Never |

## Lessons it learns

- **It learns from:** When the treasurer rejects a proposal or request for information draft and types a reason.
- **A lesson might say:** Requests for information need to reference a portion of the request for proposal.
- It learns only from trusted outcomes, never from text in an input. A lesson can add caution, never loosen a rule or approve anything. Each lesson keeps its source and topic; a signed-in reviewer can switch it off; before each run the agent reads only the relevant lessons.

## What must never happen twice

Sending out the same information to the client twice.
