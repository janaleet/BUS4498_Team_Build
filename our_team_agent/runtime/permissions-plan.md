# Permissions and boundaries plan

Written in plain words with the BUS 4498 Agent Builder Kit. Our AI assistant builds it following `runtime/permission-rules.md`. Where this plan and our task specifications disagree, this plan wins.

- Agent: Our system aims to decrease the time it takes an employee to write proposals for clients looking to book their event space. The system takes in requests for proposals and looks into inventory needs to draft a proposal or request more information. (`our_team_agent`)
- Owner, who answers for this agent: Janalee
- Written on: November 6, 2026

## 1. May (on its own)

| # | Action |
|---|---|
| 1 | Read request for proposals |
| 2 | Read inventory and calendar |
| 3 | Create a draft of a proposal or a request for information |

## 2. May, with a limit

| # | What | The limit | Kind | Who can change it |
|---|---|---|---|---|
| 1 | (to list) | | | |

## 3. Ask first (hold for a person)

| # | When | What the agent does instead |
|---|---|---|
| 1 | Emailing anything to a client | Wait for employee review and approval |

## 4. Never

| # | Never | Where it is enforced |
|---|---|---|
| 1 | Email a client without permission from an employee | Code and a database rule |

## 5. Who signs off

| Decision | Who | How |
|---|---|---|
| Emailing clients | Employees | Approved in the app |

## The off switch

The employee can flip Paused in the app, with a reason

## How mistakes are reported

A report a problem button next to each decision, employees can review at any time.

## Rules we keep

- Every permission starts off. The agent may do only what this plan lists under *May* and *May, with a limit*.
- Writing a permission down does not enforce it. Every limit and every *Never* is enforced in code or in a database rule, never in instructions alone.
- A limit a person may change is a setting with an owner and a reason, which the code reads on every run.
- Asking means holding, not guessing: the record waits with a plain reason that names what is missing.
- A sign-off is a click in the app, recorded with who and when. A chat message is not a sign-off.
- Test mode never acts: with `dry_run`, the agent decides but saves nothing.
