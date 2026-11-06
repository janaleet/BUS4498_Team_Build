# Hosting plan

Written in plain words with the BUS 4498 Hosting Builder. Our AI turns it into a GitHub Pages website and a Supabase backend, following `runtime/hosting-rules.md`.

## What our agent does

Takes an event inquiry an employee pastes in, removes the client’s personal details, works out the room, tables, chairs, and AV needed, and drafts a proposal for a human reviewer to approve before an employee sends it.

Our task specifications are in `our_team_agent/agent/`.

## Tasks

| # | Task | What it does | Who does it | When it runs |
|---|---|---|---|---|
| 1 | Review supplied event details | Strips out names, emails, phone numbers, and addresses, then pulls out the event type, date, times, guest count, and layout, and notes which are missing. | Code (a fixed rule) | When someone submits something |
| 2 | Prepare clarification request | Writes a short message asking the client for the missing or conflicting details, with the inquiry ID and a 3-business-day deadline. | The AI | After another task |
| 3 | Identify event setup needs | Picks the smallest room that fits and calculates tables, chairs, and AV from the room list, then flags requests the rules don’t cover. | Code (a fixed rule) | After another task |
| 4 | Prepare template proposal | Fills the standard proposal template with the event and setup details. | Code (a fixed rule) | After another task |
| 5 | Prepare tailored proposal | Writes a custom proposal for events the template doesn’t fit, such as weddings or events with special requests. | The AI | After another task |
| 6 | Human-review proposal packet | Checks the draft against the inquiry and setup list, then marks it ready, needs revision, or needs clarification. | A person | After another task |
| 7 | Revise proposal packet | Makes the reviewer’s requested changes, checks them against the original details, and stops if it finds a conflict. | The AI | After a person decides |

## What our agent must remember

Every inquiry, filed under its inquiry ID, with its de-identified event details and setup list, its drafts and final proposal, where it stands: in progress, waiting for the client, ready, or stopped, each review outcome and comment, who reviewed it, and the revision round, when a clarification was sent, when the reminder is due, and when the deadline passes.
It never stores client names, emails, phone numbers, or addresses.

## Who can see or change what

No one sees anything without signing in, and new sign-ups are turned off. Employees paste inquiries, enter client replies, see every inquiry, and download proposals to send. Only the reviewer marks a proposal ready, needing revision, or needing clarification. The event coordinator sees inquiries that failed or hit the revision limit. Venue staff update the room list in Google Sheets. Clients never use the system.

## Files, emails, and online services

Employees paste or upload inquiries as text files. The app creates Word (.docx) proposals from the template and keeps them in private storage. It uses Claude for reading inquiries and drafting, Google Sheets for the room list, and Supabase for the database, storage, and sign-in. No emails: employees send clarifications and proposals from their own email.

## How we share it

- **Owner** of the GitHub repository and the Supabase project: Janalee.
- The owner adds the teammate as a **collaborator** on GitHub and invites them as a **Developer** in the Supabase organization.
- We say “I’m working on it” before we start and “pushed” when we stop, in: Group chat.
- One of us works at a time: pull before you start, push when you stop.
- Our AI updates `HANDOFF.md` after every feature, so either of us can continue.
