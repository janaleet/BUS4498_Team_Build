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
- **Source:** Identify event setup needs; event coordinator/event proposal employee.

- **If a required input is missing or invalid:** Route the request to T2 ,Prepare clarification request and notify the task owner.

## 3. Outputs

### Output 1

- **Output name:** Draft template-based event proposal
- **Contents and format:** A completed Markdown or template-based proposal containing the confirmed event summary, date and time, guest count, recommended event space, tables, chairs, AV equipment, layout, setup requirements, unresolved items, and clearly marked assumptions. Do not retain unnecessary client personal information.
- **Next task or recipient:** D2 Use template
- **Complete when:** The approved template is populated with all available event and setup information, unresolved items are clearly identified, required sections are complete, and the draft is ready for the D2 template decision.

## 4. Planned Tools

### Tool 1

- **Tool name:** populate_template_proposal
- **Input:** Event setup needs assessment and approved event proposal template
- **Output:** Draft template-based event proposal
- **Implementation Route:** Manually complete the approved proposal template using the event setup assessment; no file operations, functions/scripts, database queries, or web API calls.
- **Integration approach:** Direct handoff to D2 · Use template?; no MCP integration.
- **Role in this task:** Create an efficient, accurate proposal draft using the approved template while preserving source accuracy and client privacy.
- **Task timeout:** 10 minutes from receipt, supporting the team goal of completing proposals within 30 minutes.
- **Maximum retries:** 0
- **Retry only when:** Not applicable
- **On timeout, exhausted retries, or an error that cannot be retried:** Record the status and supporting evidence without retaining client personal information, notify the task owner/event coordinator, and route the item to D2 or T5 as appropriate.
