# Prepare template proposal Task Specification

## Basic Information

- **Task ID:** T4
- **Task name:** Prepare template proposal
- **Task type:** Act
- **Task owner:** Proposed event-space employee

## 1. Task Description

Prepare a proposal using an available template and the documented event setup needs.

## 2. Inputs

### Input 1

- **Input name:** Event setup needs assessment
- **Contents and format:** Markdown checklist or table showing the confirmed event details and required space, capacity, tables, chairs, AV equipment, layout, setup, teardown, and unresolved questions.
- **Source:** T3 · Identify event setup needs, after D2 · Use template? finds the template suitable.

### Input 2

- **Input name:** Approved proposal template
- **Contents and format:** Word (.docx) template with placeholders such as {{event_type}}, {{event_date}}, {{guest_count}}, {{room}}, {{tables}}, {{chairs}}, {{av_equipment}}, {{layout}}, and {{unresolved_items}}.
- **Source:** our_team_agent/docs/proposal-template.docx

- **If a required input is missing or invalid:** Route the request to T2 ,Prepare clarification request and notify the task owner.

## 3. Outputs

### Output 1

- **Output name:** Draft template-based event proposal
- **Contents and format:** A completed .docx proposal with the inquiry ID, event summary, date and time, guest count, recommended room, tables, chairs, AV equipment, layout, setup requirements, unresolved items, and clearly marked assumptions. Any placeholder without a value shows [TO CONFIRM] and is listed under unresolved items. No client personal information.
- **Next task or recipient:** T6 · Human-review proposal packet
- **Complete when:** Every placeholder is filled or marked [TO CONFIRM], unresolved items are listed, and the draft is ready for human review.

## 4. Planned Tools

### Tool 1

- **Tool name:** fill_proposal_template
- **Input:** Event setup needs assessment and approved proposal template
- **Output:** Draft template-based event proposal (.docx)
- **Implementation Route:** Function/script. Code uses a Word library (such as python-docx) to place each value into its matching placeholder. No AI model is used.
- **Integration approach:** Runs inside the app; the draft goes to T6 in the review dashboard. No MCP integration.
- **Role in this task:** Produce a consistent proposal draft quickly from the documented setup.
- **Task timeout:** 15 seconds
- **Maximum retries:** 1
- **Retry only when:** Saving the file fails because of a temporary write error.
- **On timeout, exhausted retries, or an error that cannot be retried:** Record the status under the inquiry ID, notify the event coordinator, and route the item to T5 · Prepare tailored proposal.
