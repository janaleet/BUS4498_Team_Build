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
- **Source:** T3 · Identify event setup needs, after D2 · Use template? finds that tailoring is needed.

### Input 2

- **Input name:** Template suitability decision and approved template
- **Contents and format:** The D2 result showing which of the three template checks failed (event type not on the template list, guest count outside a standard layout, or special requests), plus the approved proposal template used as the starting structure.
- **Source:** D2 · Use template?; our_team_agent/docs/proposal-template.docx

- **If a required input is missing or invalid:** Route the request to T2 · Prepare clarification request and notify the task owner.

## 3. Outputs

### Output 1

- **Output name:** Tailored event proposal packet
- **Contents and format:** A .docx proposal with the inquiry ID that follows the template's section order and contains the confirmed event summary, setup requirements, tailored space and equipment recommendations, a list of template deviations with the D2 reason for each, unresolved items, and source-supported assumptions. No client personal information.
- **Next task or recipient:** T6 · Human-review proposal packet.
- **Complete when:** The proposal addresses the event’s confirmed needs, all departures from the standard template are documented, unresolved issues are clearly marked, and the packet is ready for human review.

## 4. Planned Tools

### Tool 1

- **Tool name:** prepare_tailored_proposal
- **Input:** Event setup needs assessment; template suitability decision and approved template
- **Output:** Tailored event proposal packet
- **Implementation Route:** Web API call to the Claude API, model claude-sonnet-5-5. The model writes only the sections that need tailoring; code places them into the template so the standard sections stay unchanged. The model is told not to add facts that are not in the setup assessment.
- **Integration approach:** Called by the app's workflow controller; the draft goes to T6 in the review dashboard. No MCP integration.
- **Role in this task:** Adapt the proposal to the event’s specific requirements when the standard template is not sufficient, while preserving source accuracy and privacy.
- **Task timeout:** 60 seconds per call
- **Maximum retries:** 2
- **Retry only when:** The call times out or the API returns a temporary error.
- **On timeout, exhausted retries, or an error that cannot be retried:** Record the status under the inquiry ID, notify the event coordinator, and show the employee the T3 assessment and blank template to draft by hand, then send the draft to T6.
