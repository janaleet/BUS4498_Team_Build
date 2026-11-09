// Automated checks for T2 clarification-request rules: business-day deadlines, the
// issue list, draft layout and checks, and copying details from the earlier record.
// Run from the repository root with either:
//   deno run --allow-read tests/clarify.test.js
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/clarify.test.js
import {
  addBusinessDays, assembleDraft, buildIssues, checkDraft, checklistWording, formatDeadline, mergeReplyFields, todayInVenue,
} from "../supabase/functions/agent/clarify.js";
import { checkEventDetails } from "../supabase/functions/agent/d1.js";

const log = typeof print === "function" ? print : console.log;
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) passed++;
  else {
    failed++;
    log(`FAIL: ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

// ---------- Business days (Monday–Friday, minus holidays) ----------
check("Fri + 3 business days = Wed", addBusinessDays("2026-11-06", 3) === "2026-11-11", addBusinessDays("2026-11-06", 3));
check("Fri + 2 business days = Tue (reminder)", addBusinessDays("2026-11-06", 2) === "2026-11-10");
check("holiday skipped", addBusinessDays("2026-11-06", 3, ["2026-11-11"]) === "2026-11-12");
check("Mon + 3 = Thu", addBusinessDays("2026-11-09", 3) === "2026-11-12");
check("Wed + 3 crosses the weekend = Mon", addBusinessDays("2026-11-11", 3) === "2026-11-16");
check("date format", formatDeadline("2026-11-11") === "Wednesday, November 11, 2026", formatDeadline("2026-11-11"));
check("today in venue is a date", /^\d{4}-\d{2}-\d{2}$/.test(todayInVenue()));

// ---------- Issues from D1 (sample 3: late April, 30–50 people) ----------
const sample3 = checkEventDetails({
  event_type: { value: "birthday party", status: "found", evidence: "my sister's 40th birthday" },
  event_date: { value: "", status: "missing", evidence: "" },
  start_time: { value: "", status: "missing", evidence: "" },
  end_time: { value: "", status: "missing", evidence: "" },
  guest_count: { value: "30-50", status: "conflicting", evidence: "Probably around 30–50 people" },
  preferred_layout: { value: "", status: "missing", evidence: "" },
}, "");
{
  const issues = buildIssues(sample3, null);
  check("sample 3: five issues", issues.length === 5, JSON.stringify(issues.map((i) => i.field)));
  const guests = issues.find((i) => i.field === "guest_count");
  check("sample 3: guest count conflicting with the client's words", guests.status === "conflicting" && guests.known === "30-50");
}
// ---------- Issues from T3 (no room fits; unknown equipment) ----------
{
  const issues = buildIssues({ d1_result: "sufficient" }, {
    route: "clarify", room: null, guest_count: 280, layout: "banquet",
    unresolved: ["No room fits 280 guests in a banquet layout; the largest is the Grand Ballroom at 240."], av: [],
  });
  check("no room fits -> one issue", issues.length === 1 && issues[0].field === "guest_count_and_layout");
}
{
  const issues = buildIssues({ d1_result: "sufficient" }, {
    route: "clarify", room: "Garden Room", guest_count: 40, layout: "classroom", unresolved: [],
    av: [{ item: "Projector", status: "needed" }, { item: "Teleprompter", status: "unknown", source: "Client request" },
      { item: "Confidence monitor", status: "unknown", source: "Client request" }],
  });
  check("two unknown items -> two issues", issues.length === 2 && issues[0].label === "Teleprompter");
}

// ---------- Draft layout and checks ----------
const wording = {
  intro: "Thank you for your inquiry about a 40th birthday party in late April. To prepare your proposal, we need a few more details:",
  questions: [
    { label: "Event date", text: "You mentioned late April. Which single date, including the year?" },
    { label: "Start and end time", text: "What time would the party start and end?" },
    { label: "Guest count", text: "You mentioned around 30–50 people. What one number should we plan for?" },
    { label: "Room layout", text: "Which layout would you like: theater, classroom, banquet, reception, or boardroom?" },
  ],
  closing_note: "Once we have these details, your proposal will include the room and setup that fit your event.",
};
{
  const draft = assembleDraft("INQ-0043", "2026-11-11", wording);
  check("subject has the ID", draft.subject === "INQ-0043 – A few details needed for your event proposal");
  check("body numbered 1..4", /\n1\. Event date — /.test(draft.body) && /\n4\. Room layout — /.test(draft.body));
  check("body has deadline and reply line", draft.body.includes("Please reply to this message by Wednesday, November 11, 2026, keeping INQ-0043"));
  check("body uses placeholders, not names", draft.body.startsWith("Hello [CLIENT NAME],") && draft.body.includes("[EMPLOYEE NAME]"));
  const c = checkDraft(draft, "INQ-0043", "2026-11-11", 5);
  check("assembled draft passes the check", c.ok, c.problems.join(" "));
}
{
  const draft = assembleDraft("INQ-0043", "2026-11-11", { ...wording, closing_note: "Call me at (805) 555-0142 or jane@example.com." });
  const c = checkDraft(draft, "INQ-0043", "2026-11-11", 5);
  check("phone and email caught", !c.ok && c.problems.some((p) => /phone/.test(p)) && c.problems.some((p) => /email/.test(p)), c.problems.join(" "));
}
{
  const draft = assembleDraft("INQ-0043", "2026-11-11", wording);
  check("wrong deadline caught", !checkDraft(draft, "INQ-0043", "2026-11-12", 5).ok);
  check("wrong inquiry ID caught", !checkDraft(draft, "INQ-0099", "2026-11-11", 5).ok);
  check("too many questions caught", !checkDraft(draft, "INQ-0043", "2026-11-11", 3).ok);
  check("edited text without the date caught", !checkDraft({ ...draft, body: draft.body.replace("Wednesday, November 11, 2026", "soon") }, "INQ-0043", "2026-11-11", 5).ok);
}
{
  const issues = buildIssues(sample3, null);
  const draft = assembleDraft("INQ-0043", "2026-11-11", checklistWording(issues));
  const c = checkDraft(draft, "INQ-0043", "2026-11-11", issues.length);
  check("checklist fallback draft passes", c.ok && c.questions === 5, c.problems.join(" "));
  check("checklist fallback quotes the client", draft.body.includes('You mentioned "30-50"'));
}

// ---------- A reply updates the earlier record ----------
{
  const reply = {
    event_date: { value: "2027-04-24", status: "found", evidence: "Saturday, April 24, 2027" },
    start_time: { value: "18:00", status: "found", evidence: "6 to 10 pm" },
    end_time: { value: "22:00", status: "found", evidence: "6 to 10 pm" },
    guest_count: { value: "45", status: "found", evidence: "let's plan for 45" },
    preferred_layout: { value: "", status: "missing", evidence: "" },
    event_type: { value: "", status: "missing", evidence: "" },
  };
  const merged = mergeReplyFields(sample3.fields, reply);
  check("reply value replaces the earlier one", merged.guest_count.value === "45" && merged.guest_count.status === "found");
  check("detail missing from the reply is copied", merged.event_type.value === "birthday party" && /earlier message/.test(merged.event_type.evidence));
  check("still-missing detail stays missing", merged.preferred_layout.status === "missing");
  const d1 = checkEventDetails(merged, "");
  check("after the reply only the layout is missing", d1.d1_result === "missing" && d1.missing_fields.join() === "preferred_layout", d1.missing_fields.join());
}

log(`${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} check(s) failed`);
