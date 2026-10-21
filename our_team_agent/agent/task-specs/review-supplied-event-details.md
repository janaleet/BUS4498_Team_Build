# Review supplied event details Task Specification

## Basic Information

- **Task ID:** T1
- **Task name:** Review supplied event details
- **Task type:** Retrieve
- **Task owner:** Proposed event-space employee

## 1. Task Description

Examine the supplied event information for guest count, event type, date, time, and other details needed to prepare a proposal.

## 2. Inputs

### Input 1

- **Input name:** Event inquiry
- **Contents and format:** Pasted or uploaded text of one client event inquiry (email, web form, or notes), or a client reply to an earlier clarification request that carries an existing inquiry ID.
- **Source:** Event-space employee pastes or uploads the inquiry; client replies return from the clarification handoff after T2.

- **If a required input is missing or invalid:** If the inquiry is empty or unreadable, show an error to the employee and do not start a run.

## 3. Outputs

### Output 1

- **Output name:** De-identified event information
- **Contents and format:** A JSON record with the inquiry ID (for example, INQ-0042); the six required fields (event type, event date, start time, end time, guest count, preferred layout); optional fields (room preference, AV requests, catering, special requests, budget); for each field a status of found, missing, or conflicting, with the supporting sentence from the inquiry. Client names, email addresses, phone numbers, and street addresses are removed.
- **Next task or recipient:** D1 · Sufficient event details?
- **Complete when:** Every required field is marked found, missing, or conflicting, personal details have been removed, and the record has an inquiry ID.


## 4. Planned Tools

### Tool 1

- **Tool name:** remove_personal_details
- **Input:** Event inquiry
- **Output:** Inquiry text with personal details replaced by placeholders such as [NAME] and [EMAIL], plus a new or matched inquiry ID
- **Implementation Route:** Function/script. Code finds and removes email addresses, phone numbers, and street addresses with fixed patterns, and removes names listed in the email signature or form fields. It runs before anything is saved or sent to the AI model.
- **Integration approach:** Runs inside the app; no MCP integration.
- **Role in this task:** Enforce the privacy goal so no client personal information is stored or sent to the model.
- **Task timeout:** 5 seconds
- **Maximum retries:** 0
- **Retry only when:** Not applicable (the same input always gives the same result)
- **On timeout, exhausted retries, or an error that cannot be retried:** Stop the run, send nothing to the model, and ask the employee to remove personal details by hand and resubmit.

### Tool 2

- **Tool name:** extract_event_details
- **Input:** De-identified inquiry text
- **Output:** De-identified event information (JSON)
- **Implementation Route:** Web API call to the Claude API, model claude-haiku-5-5, instructed to return only JSON with the required and optional fields and a found/missing/conflicting status for each.
- **Integration approach:** Called by the app's workflow controller; the result goes to D1.
- **Role in this task:** Interpret guest count, event type, date, time, and layout from free-form text.
- **Task timeout:** 30 seconds per call
- **Maximum retries:** 2
- **Retry only when:** The call times out, the API returns a temporary error, or the reply is not valid JSON.
- **On timeout, exhausted retries, or an error that cannot be retried:** Show the employee a blank form with the six required fields to fill in by hand, record the failure under the inquiry ID, and continue to D1.
