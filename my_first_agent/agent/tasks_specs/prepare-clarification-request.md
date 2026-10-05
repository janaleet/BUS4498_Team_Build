# Prepare clarification request Task Specification

## Basic Information

- **Task ID:** T2
- **Task name:** Prepare clarification request
- **Task type:** Act
- **Task owner:** Proposed event-space employee

## 1. Task Description

List the missing event details and prepare a focused clarification request for follow-up.

## 2. Inputs

### Input 1

- **Input name:** Unresolved event details and review findings
- **Contents and format:** A Markdown or template-based list of missing, conflicting, or unclear event information, including the affected proposal field, known information, source evidence, and why clarification is required.
- **Source:** T1 · Review supplied event details, T3 · Identify event setup needs, T6 · Human-review proposal packet, or T7 · Revise proposal packet.

- **If a required input is missing or invalid:** Record the issue and notify the task owner/event coordinator.

## 3. Outputs

### Output 1

- **Output name:** Clarification request packet
- **Contents and format:** A concise Markdown request containing the event context, numbered clarification questions, the information needed for each question, a response deadline, and instructions for returning the information. Exclude unnecessary client personal information.
- **Next task or recipient:** : Client-facing employee, who sends the request and returns the response to T1 or T3.
- **Complete when:** Every unresolved issue has a clear question, the request asks only for information needed to complete the proposal, the recipient is identified, and the request is ready for client-facing delivery.

## 4. Planned Tools

### Tool 1

- **Tool name:** draft_clarification_request
- **Input:** Unresolved event details and review findings
- **Output:** Clarification request packet
- **Implementation Route:** Manual review and drafting in the proposal workflow; no file operations, functions/scripts, database queries, or web API calls.
- **Integration approach:** Direct human handoff to the client-facing employee; no MCP integration.
- **Role in this task:** Convert missing or conflicting proposal information into clear, actionable clarification questions while preserving source accuracy and privacy.
- **Task timeout:** 10 minutes from identification of the missing information.
- **Maximum retries:** 0
- **Retry only when:** na
- **On timeout, exhausted retries, or an error that cannot be retried:** Record the blocked status and supporting evidence, notify the task owner/event coordinator, and hand off the exception to the client-facing employee or responsible clarification queue.
