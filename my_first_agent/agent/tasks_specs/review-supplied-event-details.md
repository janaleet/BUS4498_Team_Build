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

- **Input name:** Request for Proposal
- **Contents and format:** Event name, a company overview, project scope, budget, timeline, and evaluation criteria
- **Source:** Client

- **If a required input is missing or invalid:** T2 - Prepare clarification request

## 3. Outputs

### Output 1

- **Output name:** Event Information
- **Contents and format:** Guest count, event type, date, time, and other details needed to prepare a proposal.
- **Next task or recipient:** T3
- **Complete when:** When all required details are recorded and clarified.

## 4. Planned Tools

### Tool 1

- **Tool name:** check_completeness
- **Input:** Request for Proposal
- **Output:** Event Information
- **Implementation Route:** Manual review in the template; no file operations, functions/scripts, database queries, or web API calls.
- **Integration approach:** Direct human review followed by D1, “Sufficient event details?” No MCP integration.
- **Role in this task:** Check completeness and consistency of guest count, event type, date, time, space, tables, chairs, and AV needs; confirm readiness for proposal preparation.
- **Task timeout:** 10 minutes from receipt, supporting the 30-minute proposal goal.
- **Maximum retries:** 0
- **Retry only when:** NA
- **On timeout, exhausted retries, or an error that cannot be retried:** Record the status and evidence without retaining client personal information, then notify the task owner and route the request to T3, “Identify event setup needs,” or T2, “Prepare clarification request.”
