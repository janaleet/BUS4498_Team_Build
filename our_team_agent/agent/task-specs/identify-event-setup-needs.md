# Identify event setup needs Task Specification

## Basic Information

- **Task ID:** T3
- **Task name:** Identify event setup needs
- **Task type:** Decide
- **Task owner:** Proposed event-space employee

## 1. Task Description

Document the indicated chairs, tables, AV equipment, event-space needs, and unresolved setup questions from the supplied details.

## 2. Inputs

### Input 1

- **Input name:** Reviewed event details and identified gaps
- **Contents and format:** The T1 review and supplied event information, including confirmed or missing guest count, event type, date, time, location, space requirements, layout, tables, chairs, AV needs, setup/teardown requirements, and source notes.
- **Source:** T1 · Review supplied event details; task owner/event coordinator

- **If a required input is missing or invalid:** Route the request to T2 Prepare clarification request and notify the task owner/event coordinator.

## 3. Outputs

### Output 1

- **Output name:** Event setup needs assessment
- **Contents and format:** A Markdown checklist or table listing the recommended event space, capacity, tables, chairs, AV equipment, layout, setup/teardown needs, supporting evidence, unresolved questions, and any assumptions. Do not include or retain unnecessary client personal information.
- **Next task or recipient:** Prepare template proposal. If material information remains missing, send to T2 prepare clarification request.
- **Complete when:** Every relevant setup requirement is marked as needed, not needed, or unknown, with supporting source information or a clearly documented clarification request.

## 4. Planned Tools

### Tool 1

- **Tool name:** determine_event_setup_needs
- **Input:** Reviewed event details and identified gaps
- **Output:** Event setup needs assessment
- **Implementation Route:** Manual review of the supplied event details against approved event setup rules and the proposal template; no file operations, functions/scripts, database queries, or web API calls.
- **Integration approach:** Direct human handoff to T4 Prepare template proposal; no MCP integration.
- **Role in this task:** Translate event information into practical setup requirements and identify unresolved information that could affect the proposal.
- **Task timeout:** 10 minutes from receipt, supporting the team goal of completing proposals within 30 minutes.
- **Maximum retries:** 0
- **Retry only when:** NA
- **On timeout, exhausted retries, or an error that cannot be retried:** On timeout, exhausted retries, or an error that cannot be retried: Record the status and supporting evidence without retaining client personal information, notify the task owner/event coordinator, and route the request to T2 or T4 as appropriate.
