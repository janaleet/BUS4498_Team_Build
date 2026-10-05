# Prepare tailored proposal Task Specification

## Basic Information

- **Task ID:** T5
- **Task name:** Prepare tailored proposal
- **Task type:** Act
- **Task owner:** Proposed event-space employee

## 1. Task Description

Prepare a tailored proposal when a template is not suitable for the documented event setup needs.

## 2. Inputs

### Input 1

- **Input name:** Event setup needs assessment
- **Contents and format:** Markdown checklist or table containing confirmed event details and setup requirements, including guest count, event type, date, time, space, tables, chairs, AV, layout, setup, teardown, and unresolved questions.
- **Source:** Identify event setup needs.

### Input 2

- **Input name:** Template suitability decision and draft proposal
- **Contents and format:** The D2 decision showing that tailoring is needed, together with the existing template draft and the reasons the standard template does not fit.
- **Source:** Use template? and T4 · Prepare template proposal.

- **If a required input is missing or invalid:** Route the request to T2 · Prepare clarification request and notify the task owner.

## 3. Outputs

### Output 1

- **Output name:** Tailored event proposal packet
- **Contents and format:** A customized Markdown or template-based proposal containing the confirmed event summary, setup requirements, tailored space and equipment recommendations, documented template deviations, unresolved items, and source-supported assumptions. Do not include or retain unnecessary client personal information.
- **Next task or recipient:** T6 · Human-review proposal packet.
- **Complete when:** The proposal addresses the event’s confirmed needs, all departures from the standard template are documented, unresolved issues are clearly marked, and the packet is ready for human review.

## 4. Planned Tools

### Tool 1

- **Tool name:** prepare_tailored_proposal
- **Input:** Event setup needs assessment and template suitability decision and draft proposal
- **Output:** Tailored event proposal packet
- **Implementation Route:** Manual drafting and editing in the proposal workflow; no file operations, functions/scripts, database queries, or web API calls.
- **Integration approach:** Direct handoff to T6 · Human-review proposal packet; no MCP integration.
- **Role in this task:** Adapt the proposal to the event’s specific requirements when the standard template is not sufficient, while preserving source accuracy and privacy.
- **Task timeout:** 10 minutes from receipt, supporting the team goal of completing proposals within 30 minutes.
- **Maximum retries:** 0
- **Retry only when:** na
- **On timeout, exhausted retries, or an error that cannot be retried:** Record the status and supporting evidence without retaining client personal information, notify the task owner/event coordinator, and route the item to T2 or T6 as appropriate.
