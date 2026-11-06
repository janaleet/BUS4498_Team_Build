// Automated checks for the T1 personal-details remover and the D1 rules.
// Run from the repository root with either:
//   deno run --allow-read tests/rules.test.js
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/rules.test.js   (macOS, no install needed)
import { removePersonalDetails } from "../supabase/functions/intake-inquiry/pii.js";
import { checkEventDetails } from "../supabase/functions/intake-inquiry/d1.js";

const log = typeof print === "function" ? print : console.log;
const load = (path) => (typeof read === "function" ? read(path) : Deno.readTextFileSync(path));
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) passed++;
  else {
    failed++;
    log(`FAIL: ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

// ---------- remove_personal_details ----------
{
  const { text, replaced } = removePersonalDetails(load("tests/fixtures/synthetic-inquiry-4-personal-details.txt"));
  for (const leaked of ["Priya", "Shah", "Daniel", "Ortiz", "@", "555", "1450 Foothill", "93405"]) {
    check(`sample 4 removes "${leaked}"`, !text.includes(leaked), text);
  }
  check("sample 4 keeps the company name", text.includes("Bluewater Logistics"));
  check("sample 4 keeps the event details", text.includes("December 10, 2027") && text.includes("70 guests"));
  check("sample 4 counts emails", replaced.EMAIL === 2, JSON.stringify(replaced));
  check("sample 4 counts phones", replaced.PHONE === 2, JSON.stringify(replaced));
  check("sample 4 counts the address", replaced.ADDRESS >= 1, JSON.stringify(replaced));
}
{
  const { text } = removePersonalDetails(load("tests/fixtures/synthetic-inquiry-5-web-form.txt"));
  for (const leaked of ["Marcus", "Lee", "@", "555", "Ocean View", "93442"]) {
    check(`sample 5 removes "${leaked}"`, !text.includes(leaked), text);
  }
  check("sample 5 keeps form labels", text.includes("Name: [NAME]") && text.includes("Email: [EMAIL]"), text);
  check("sample 5 keeps the organization", text.includes("Harbor Arts Collective"));
  check("sample 5 keeps the date and times", text.includes("2027-05-04") && text.includes("8:30 AM"));
}
for (const file of [
  "sample-inquiry-1-template-fit.txt",
  "sample-inquiry-2-needs-tailoring.txt",
  "sample-inquiry-3-missing-details.txt",
]) {
  const original = load(`our_team_agent/docs/sample-inquiries/${file}`);
  const { text } = removePersonalDetails(original);
  check(`${file} is unchanged (already de-identified)`, text === original.replace(/\r\n?/g, "\n"), text);
}
{
  const { text } = removePersonalDetails("We expect 45 guests from 9:00 AM to 3:00 PM on 2027-03-11 in the Garden Room.");
  check("plain event details are untouched", text === "We expect 45 guests from 9:00 AM to 3:00 PM on 2027-03-11 in the Garden Room.", text);
}
{
  const { text } = removePersonalDetails("Call 8055550123 or +44 20 7946 0958.\n\nBest regards,\nAna López and Tom Reyes");
  check("bare and international phone numbers are removed", !/\d{4}/.test(text), text);
  check("a two-person signature is removed", text.endsWith("[NAME] and [NAME]"), text);
}
{
  let threw = false;
  try {
    removePersonalDetails(undefined);
  } catch {
    threw = true;
  }
  check("missing text is refused", threw);
}

// ---------- D1 · Sufficient event details? ----------
const found = (value, evidence = "") => ({ value, status: "found", evidence });
const missing = () => ({ value: "", status: "missing", evidence: "" });
const complete = {
  event_type: found("Corporate meeting"),
  event_date: found("2027-03-11"),
  start_time: found("9:00 AM"),
  end_time: found("15:00"),
  guest_count: found("45"),
  preferred_layout: found("Classroom"),
};
{
  const r = checkEventDetails(complete);
  check("all six found -> sufficient", r.d1_result === "sufficient", JSON.stringify(r.missing_fields));
  check("times are normalized", r.fields.start_time.value === "09:00" && r.fields.end_time.value === "15:00");
  check("layout is normalized", r.fields.preferred_layout.value === "classroom");
}
{
  const r = checkEventDetails({ ...complete, guest_count: found("30–50") });
  check("a guest-count range is conflicting", r.fields.guest_count.status === "conflicting");
  check("a range -> missing details", r.d1_result === "missing" && r.missing_fields.includes("guest_count"));
}
{
  const r = checkEventDetails({ ...complete, end_time: found("8:00 AM") });
  check("end before start -> both conflicting", r.fields.start_time.status === "conflicting" && r.fields.end_time.status === "conflicting");
}
{
  const r = checkEventDetails({ ...complete, event_date: found("late April") });
  check("a vague date -> missing", r.fields.event_date.status === "missing" && r.d1_result === "missing");
}
{
  const r = checkEventDetails({ ...complete, event_date: found("2027-02-30") });
  check("an impossible date -> missing", r.fields.event_date.status === "missing");
}
{
  const r = checkEventDetails({ ...complete, preferred_layout: found("U-shape") });
  check("an unknown layout -> conflicting", r.fields.preferred_layout.status === "conflicting");
}
{
  const r = checkEventDetails({ ...complete, start_time: found("9") });
  check("a bare hour -> missing", r.fields.start_time.status === "missing");
}
{
  const r = checkEventDetails({ ...complete, preferred_layout: missing() });
  check("one missing field -> missing details", r.d1_result === "missing" && r.missing_fields.length === 1);
}
{
  const r = checkEventDetails({}, "");
  check("nothing extracted -> all six missing", r.missing_fields.length === 6);
}
{
  const source = "We'll have 45 people and would like classroom-style seating.";
  const r = checkEventDetails({ ...complete, guest_count: found("45", "We'll have 45 people") }, source);
  check("supporting sentence found in text", r.fields.guest_count.evidence_in_text === true);
  check("missing supporting sentence flagged", r.fields.event_type.evidence_in_text === false);
}

log(`${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} check(s) failed`);
