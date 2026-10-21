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
- **Contents and format:** The T1 de-identified event information (JSON) with its inquiry ID, including guest count, event type, date, start and end time, preferred layout, AV requests, special requests, and source notes.
- **Source:** T1 · Review supplied event details, after D1 finds the details sufficient.

### Input 2

- **Input name:** Room, equipment, and setup rules
- **Contents and format:** rooms-and-equipment.csv (each room's capacity by layout, available tables, chairs, and AV items) and setup-and-routing-rules.md (how guest count and event type translate into chairs, tables, and AV, and the template list used by D2).
- **Source:** our_team_agent/docs/

- **If a required input is missing or invalid:** Route the request to T2 Prepare clarification request and notify the task owner/event coordinator.

## 3. Outputs

### Output 1

- **Output name:** Event setup needs assessment
- **Contents and format:** A Markdown table with the inquiry ID, recommended room and capacity, tables, chairs, AV equipment, layout, setup/teardown needs, each marked needed, not needed, or unknown with its source; unresolved questions; assumptions; and the three D2 checks (event type on template list: yes/no; guest count fits a standard layout: yes/no; special requests: list or none). No client personal information.
- **Next task or recipient:** D2 · Use template?; if any required setup item is unknown or no room fits, T2 · Prepare clarification request.
- **Complete when:** Every setup item is marked needed, not needed, or unknown with a source, and all three D2 checks are filled in.

## 4. Planned Tools

### Tool 1

- **Tool name:** calculate_setup_needs
- **Input:** Guest count, event type, and preferred layout from T1; rooms-and-equipment.csv; setup-and-routing-rules.md
- **Output:** Recommended room, chairs, tables, AV package, and the three D2 checks
- **Implementation Route:** Function/script. Code reads the CSV and applies the fixed rules (for example, round tables of 8 for a banquet: tables = guest count ÷ 8, rounded up).
- **Integration approach:** Runs inside the app; no MCP integration.
- **Role in this task:** Turn guest count and event type into a consistent setup list.
- **Task timeout:** 10 seconds
- **Maximum retries:** 0
- **Retry only when:** Not applicable (the same input always gives the same result)
- **On timeout, exhausted retries, or an error that cannot be retried:** If no room fits, mark the room unknown and route to T2. If the CSV cannot be read, stop and notify the event coordinator.

### Tool 2

- **Tool name:** flag_setup_questions
- **Input:** Special requests and AV requests from T1, plus the Tool 1 setup list
- **Output:** A list of unresolved setup questions and any items the rules do not cover
- **Implementation Route:** Web API call to the Claude API, model claude-haiku-5-5, returning JSON.
- **Integration approach:** Called by the app's workflow controller after Tool 1.
- **Role in this task:** Spot requests the fixed rules cannot handle, such as a stage, dance floor, or livestream.
- **Task timeout:** 30 seconds per call
- **Maximum retries:** 2
- **Retry only when:** The call times out, the API returns a temporary error, or the reply is not valid JSON.
- **On timeout, exhausted retries, or an error that cannot be retried:** Continue with the Tool 1 setup list, add the note "Special requests not checked – review in T6", and go to D2.
