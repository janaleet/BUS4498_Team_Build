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
- **Contents and format:** A list of missing, conflicting, or unclear event information with the inquiry ID, including the affected proposal field, known information, source evidence, and why clarification is required.- **Source:** T1 · Review supplied event details, T3 · Identify event setup needs, T6 · Human-review proposal packet, or T7 · Revise proposal packet.

- **If a required input is missing or invalid:** Record the issue and notify the task owner/event coordinator.

## 3. Outputs

### Output 1

- **Output name:** Clarification request packet
- **Contents and format:** A short message with the inquiry ID in the subject line and body, numbered clarification questions, the information needed for each, a response deadline of 3 business days, and instructions to reply to the same message. No client personal information; the client-facing employee adds the client's name when sending.
- **Next task or recipient:** Client-facing employee, who sends the request from their own email. When the client replies, the employee pastes the reply into the app under the same inquiry ID and the run returns to T1 · Review supplied event details. If there is no reply by day 2, the employee sends one reminder. If there is no reply after 3 business days, the run is marked Stopped – no response.
- **Complete when:** Every unresolved issue has one clear question, the message carries the inquiry ID and deadline, and it is ready for the client-facing employee to send.

## 4. Planned Tools

### Tool 1

- **Tool name:** draft_clarification_request
- **Input:** Unresolved event details and review findings
- **Output:** Clarification request packet
- **Implementation Route:** Web API call to the Claude API, model claude-haiku-5-5, which turns the missing-field list into a short, polite request.
- **Integration approach:** Called by the app's workflow controller; the drafted message appears in the dashboard with a copy button for the client-facing employee. No MCP integration. (Optional later: the Gmail API can create the email as a draft.)
- **Role in this task:** Convert missing or conflicting proposal information into clear, actionable clarification questions while preserving source accuracy and privacy.
- **Task timeout:** 30 seconds per call
- **Maximum retries:** 2
- **Retry only when:** The call times out or the API returns a temporary error.
- **On timeout, exhausted retries, or an error that cannot be retried:** Show the employee the missing-field list as a checklist to write the message by hand, record the failure under the inquiry ID, and notify the event coordinator.
