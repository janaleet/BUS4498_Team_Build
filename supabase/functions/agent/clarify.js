// T2 · Prepare clarification request — the fixed parts, in code.
// The AI (draft.ts) only words the intro and the questions. Code decides which issues
// need a question, the reply-by date (3 business days, Monday–Friday, minus holidays),
// the subject and body layout, and checks every draft before anyone sees it.
// Format follows the prepare-clarification-request skill (.claude/skills/).

const FIELD_LABELS = {
  event_type: "Event type",
  event_date: "Event date",
  start_time: "Start time",
  end_time: "End time",
  guest_count: "Guest count",
  preferred_layout: "Room layout",
};

// What a usable answer looks like, per field (setup-and-routing-rules.md, section 1).
const USABLE = {
  event_type: "the type of event (for example a corporate meeting or a birthday party)",
  event_date: "one calendar date, including the year",
  start_time: "a clock time, such as 6:00 PM",
  end_time: "a clock time, such as 10:00 PM",
  guest_count: "one number of guests",
  preferred_layout: "one of: theater, classroom, banquet (seated at round tables), reception (standing), or boardroom",
};

export const DEADLINE_BUSINESS_DAYS = 3;
export const REMINDER_BUSINESS_DAY = 2;

/** Today's date in the venue's time zone (America/Los_Angeles), as YYYY-MM-DD. */
export function todayInVenue(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Add n business days (Monday–Friday, skipping holidays) to a YYYY-MM-DD date. */
export function addBusinessDays(startIso, n, holidays = []) {
  const skip = new Set(holidays);
  const d = new Date(`${startIso}T12:00:00Z`);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !skip.has(iso)) added++;
  }
  return d.toISOString().slice(0, 10);
}

/** 2026-11-11 -> "Wednesday, November 11, 2026" (matches the database's to_char format). */
export function formatDeadline(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d);
}

/**
 * The issues that need a question, from D1 (missing or conflicting fields) and from T3
 * (no room fits, equipment not in the venue's list). Each issue keeps its source so the
 * employee can see where each question came from.
 */
export function buildIssues(decision, assessment) {
  const issues = [];
  if (decision && decision.d1_result === "missing") {
    for (const name of decision.missing_fields) {
      const f = decision.fields[name] || {};
      issues.push({
        field: name,
        label: FIELD_LABELS[name] || name,
        status: f.status === "conflicting" ? "conflicting" : "missing",
        known: f.value || "",
        evidence: f.evidence || "",
        usable_answer: USABLE[name] || "",
        source: "T1 · D1",
      });
    }
  }
  if (assessment && assessment.route === "clarify") {
    if (!assessment.room) {
      issues.push({
        field: "guest_count_and_layout",
        label: "Guest count and layout",
        status: "unclear",
        known: `${assessment.guest_count} guests, ${assessment.layout} layout`,
        evidence: assessment.unresolved[0] || "",
        usable_answer: "a smaller guest count, or a different layout",
        source: "T3 · no room fits",
      });
    }
    for (const item of assessment.av || []) {
      if (item.status !== "unknown") continue;
      issues.push({
        field: "equipment",
        label: item.item,
        status: "unclear",
        known: item.item,
        evidence: item.source,
        usable_answer: "whether the client can bring it, or can do without it",
        source: "T3 · equipment not in the venue's list",
      });
    }
  }
  return issues;
}

/** Plain short description of the event for the opening line, from the client's own details. */
export function eventSummary(fields) {
  const v = (n) => (fields[n] && fields[n].status === "found" ? fields[n].value : "");
  const parts = [v("event_type") || "your event"];
  if (v("event_date")) parts.push(`on ${formatDeadline(v("event_date"))}`);
  return parts.join(" ");
}

/** Put the AI's wording into the fixed layout: subject and body with the inquiry ID and reply-by date. */
export function assembleDraft(inquiryId, deadlineIso, wording) {
  const deadline = formatDeadline(deadlineIso);
  const questions = (wording.questions || []).map((q, i) => `${i + 1}. ${q.label} — ${String(q.text).trim()}`);
  const lines = [
    "Hello [CLIENT NAME],",
    "",
    String(wording.intro || "Thank you for your inquiry. To prepare your proposal, we need a few more details:").trim(),
    "",
    ...questions,
    "",
  ];
  if (wording.closing_note && String(wording.closing_note).trim()) lines.push(String(wording.closing_note).trim(), "");
  lines.push(
    `Please reply to this message by ${deadline}, keeping ${inquiryId} in the subject line, so we can match your answers to your request.`,
    "",
    "Thank you,",
    "[EMPLOYEE NAME]",
    `Reference: ${inquiryId}`,
  );
  return {
    subject: `${inquiryId} – A few details needed for your event proposal`,
    body: lines.join("\n"),
    questions: wording.questions || [],
  };
}

/** A draft written by code from the issue list, used when the AI cannot draft (the spec's checklist fallback). */
export function checklistWording(issues) {
  return {
    intro: "Thank you for your inquiry. To prepare your proposal, we need a few more details:",
    questions: issues.map((issue) => ({
      label: issue.label,
      text: `${issue.known ? `You mentioned "${issue.known}". ` : ""}Please let us know ${issue.usable_answer || "the details"}.`,
    })),
    closing_note: "",
  };
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const STREET = /\b\d{1,6}\s+(?:[A-Z][a-z]+\s){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl)\b/;

/**
 * Check a draft against the T2 output contract (same checks as the skill's check command
 * and the database's approve rule): inquiry ID in subject and body, numbered questions,
 * no more questions than issues, the exact reply-by date, a reply instruction, and no
 * email address, phone number, or street address.
 */
export function checkDraft(draft, inquiryId, deadlineIso, issueCount) {
  const problems = [];
  const subject = String(draft.subject || "");
  const body = String(draft.body || "");
  if (!subject.includes(inquiryId)) problems.push(`The subject must include ${inquiryId}.`);
  if (!body.includes(inquiryId)) problems.push(`The message must include ${inquiryId}.`);
  const numbers = [...body.matchAll(/^\s*(\d+)[.)]\s+\S/gm)].map((m) => Number(m[1]));
  if (numbers.length === 0) problems.push("The message has no numbered questions.");
  else if (numbers.some((n, i) => n !== i + 1)) problems.push("The questions are not numbered 1, 2, 3… in order.");
  if (issueCount !== undefined && numbers.length > issueCount) problems.push(`${numbers.length} questions for ${issueCount} issue(s); ask only what blocks the proposal.`);
  if (deadlineIso && !body.includes(formatDeadline(deadlineIso))) problems.push(`The reply-by date (${formatDeadline(deadlineIso)}) is missing.`);
  if (!/\breply\b/i.test(body)) problems.push("The message must ask the client to reply.");
  for (const [label, pattern] of [["an email address", EMAIL], ["a phone number", PHONE], ["a street address", STREET]]) {
    if (pattern.test(subject + "\n" + body)) problems.push(`The message contains ${label}; remove it.`);
  }
  return { ok: problems.length === 0, problems, questions: numbers.length };
}

/**
 * A client's reply updates the earlier record (memory rule 2): a detail the reply gives
 * replaces the earlier one; a detail the reply leaves out is copied from the earlier record.
 */
export function mergeReplyFields(previous, reply) {
  const merged = {};
  const names = new Set([...Object.keys(previous || {}), ...Object.keys(reply || {})]);
  for (const name of names) {
    const r = reply && reply[name];
    const p = previous && previous[name];
    if (r && (r.status === "found" || r.status === "conflicting")) {
      merged[name] = { value: r.value, status: r.status, evidence: r.evidence || "" };
    } else if (p && p.status !== "missing" && p.value) {
      merged[name] = { value: p.value, status: p.status, evidence: p.evidence ? `From the earlier message: ${p.evidence}` : "From the earlier message" };
    } else {
      merged[name] = { value: "", status: "missing", evidence: "" };
    }
  }
  return merged;
}
