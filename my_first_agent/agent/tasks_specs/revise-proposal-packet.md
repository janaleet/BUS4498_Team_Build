# Revise proposal packet Task Specification

```yaml
# BASIC INFORMATION
task_id: "T7"
task_name: "Revise proposal packet"
task_owner: "Proposed event-space employee"

# Agent Inference Configuration
Provider: "OpenAI"
Model: "gpt-5.6-terra"
Role: "Proposal-revision agent that may inspect findings, verify source details, revise draft content, and check completeness. It may not approve, release, or send the proposal."
Maximum inference requests per task run: "3"
On inference failure or exhausted limits: "Record the unresolved status and hand off to the event coordinator/designated human proposal reviewer."
```

## 1. Task Goal

- **Objective:** Address review comments using the supplied event details and return the revised packet for human review.

## 2. Inbound Inputs

### Input 1

- **Input name:** Human review outcome and annotated proposal packet
- **What it contains:** Current proposal packet, reviewer comments, required corrections, missing-information flags, review status, and supporting evidence in Markdown or template format.
- **Source:** T6 Human-review proposal packet; designated human proposal reviewer.

### Input 2

- **Input name:** Source event details and setup needs assessment
- **What it contains:** Confirmed event details and setup requirements, including guest count, event type, date, time, space, tables, chairs, AV, layout, setup, teardown, and unresolved questions.
- **Source:** T1 Review supplied event details and T3 Identify event setup needs.

## 3. Tool Permissions and Boundaries

### Task-Wide Limits

- **Total task timeout:** 10 minutes
- **Maximum tool calls:** 3

### Tool 1

- **Tool name:** revise_proposal_packet
- **Tool type:** Language-model call
- **Supports these permitted subtasks:** inspect_review_findings, verify_against_source, revise_proposal_packet, check_packet_completeness.
- **Allowed use:** Read the T6 review, proposal draft, T1/T3 source information, and approved template content; create a revised draft and revision summary in the current task workspace.
- **Prohibited use:** Invent facts, change source records, retain unnecessary client personal information, approve or release the proposal, contact the client, or send external messages.
- **Approval required:** Human approval is required before release or client-facing handoff. None is required for creating the internal revised draft.
- **Timeout per call:** 3 minutes
- **Maximum retries per call:** 1 additional attempt.
- **Retry conditions and failure response:** Retry once after a transient failure or timeout, waiting 30 seconds. Do not create a duplicate version; preserve the existing version identifier. If the retry fails or the task limit is reached, record the unresolved status and hand off to the human proposal reviewer.

Tool-specific and task-wide limits both apply; stop at whichever is reached first. Naming a tool does not authorize uses outside its stated permissions.

## 4. How the Agent Should Reason

### Permitted Subtask 1

- **Subtask name:** inspect_review_findings
- **Subtask description:** Examine the reviewer’s outcome, comments, requested edits, and evidence to identify the exact revisions required.
- **Subtask boundary:** Use only the supplied review and proposal packet. Do not infer unstated corrections.
- **Retry limits:** 1 additional attempt within the task-wide limits.

### Permitted Subtask 2

- **Subtask name:** verify_against_source
- **Subtask description:** Compare proposed changes with the supplied event details, setup assessment, and approved template.
- **Subtask boundary:** Flag conflicts or unsupported details instead of choosing or inventing a value.
- **Retry limits:** 1 additional attempt within the task-wide limits.

### Permitted Subtask 3

- **Subtask name:** revise_proposal_packet
- **Subtask description:** Apply only supported corrections and produce a revised proposal packet with a concise revision summary.
- **Subtask boundary:** The agent may revise internal draft content but may not approve, release, or send it.
- **Retry limits:** Retry limits: 1 additional attempt within the task-wide limits.

### Permitted Subtask 4

- **Subtask name:** check_packet_completeness
- **Subtask description:** Check that required proposal sections are complete, setup needs are represented, unresolved items are visible, and unnecessary client personal information is excluded.
- **Subtask boundary:** Do not mark the proposal approved; report readiness for human review only.
- **Retry limits:** 1 additional attempt within the task-wide limits.

- **Decision guidance:** After each subtask, use its findings to select the permitted subtask most likely to resolve the most important remaining uncertainty. Do not follow a fixed sequence. If no permitted subtask can make useful progress, stop and hand the case to a person.

## 5. When to Stop or Hand Off to a Human

- **Stop successfully when:** The revised packet includes every requested correction, matches the supplied event details and setup assessment, retains appropriate template defaults, contains no unsupported facts, passes the privacy check, and includes a revision summary and evidence.
- **Hand off early when:** Required source information is missing, sources conflict, the agent cannot make progress, the inference limit or timeout is reached, or a finding affects client commitments, pricing, space, equipment, timing, or release readiness.
- **Hand off to:** Designated human proposal reviewer/event coordinator or client-facing employee. Route missing-information issues to T2 · Prepare clarification request.

Stop at the first applicable budget limit or handoff condition. While awaiting review, take no further autonomous action.

## 6. Outbound Deliverable

- **Status:** Revised — ready for human review; or Blocked — clarification required.
- **Result or recommendation:** The completed result. If escalated before reaching a supported result, write undetermined.
- **Evidence summary:** The most important evidence supporting the result or explaining why no result could be reached.
- **Subtasks performed:** Permitted subtasks completed, including repeated attempts.
- **Unresolved issues:** Remaining uncertainties or questions; use none only if no unresolved issue remains.
- **Handoff note:** Reason for stopping, unresolved questions, and what the reviewer needs to decide; write Not applicable for a completed task.
- **Next task or recipient:** [Complete this field]
