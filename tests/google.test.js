// Automated checks for Group 6: the free/busy window and "booked" rule, the Gmail message
// the agent builds for an employee, the materials-log row, and Google errors in plain words.
// Run from the repository root with either:
//   deno run --allow-read tests/google.test.js
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/google.test.js
import {
  buildRawEmail, eventWindow, forwardNote, googleProblem, isBooked, LOG_HEADER, materialsRow, venueOffset,
} from "../supabase/functions/agent/google.js";

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

// Time zone: Pacific daylight vs standard time.
check("summer offset -07:00", venueOffset("2027-06-19") === "-07:00", venueOffset("2027-06-19"));
check("winter offset -08:00", venueOffset("2027-12-17") === "-08:00", venueOffset("2027-12-17"));

// The event window.
{
  const w = eventWindow("2027-06-19", "17:00", "23:00");
  check("window in venue time", w.timeMin === "2027-06-19T17:00:00-07:00" && w.timeMax === "2027-06-19T23:00:00-07:00", JSON.stringify(w));
  const late = eventWindow("2027-12-31", "20:00", "01:00");
  check("past midnight ends next day", late.timeMax === "2028-01-01T01:00:00-08:00", JSON.stringify(late));
  check("incomplete -> null", eventWindow("2027-06-19", "", "23:00") === null && eventWindow("June 19", "17:00", "23:00") === null);
}

// Booked: any overlap; touching ends are free.
{
  const w = eventWindow("2027-06-19", "17:00", "23:00");
  check("no busy -> free", !isBooked([], w));
  check("overlap -> booked", isBooked([{ start: "2027-06-19T22:00:00-07:00", end: "2027-06-20T00:30:00-07:00" }], w));
  check("inside -> booked", isBooked([{ start: "2027-06-20T01:00:00Z", end: "2027-06-20T02:00:00Z" }], w));
  check("ends at start -> free", !isBooked([{ start: "2027-06-19T12:00:00-07:00", end: "2027-06-19T17:00:00-07:00" }], w));
  check("starts at end -> free", !isBooked([{ start: "2027-06-19T23:00:00-07:00", end: "2027-06-20T01:00:00-07:00" }], w));
}

// The Gmail message: to the employee, base64url, attachment carried.
const decode = (raw) => {
  const b = atob(raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4));
  return b;
};
{
  const raw = buildRawEmail({ to: "employee@example.com", subject: "INQ-0002 – A few details", text: "Hello [CLIENT NAME],\n\nQuestion 1" });
  check("base64url only", /^[A-Za-z0-9_-]+$/.test(raw));
  const msg = decode(raw);
  check("To header is the employee", msg.includes("To: employee@example.com\r\n"));
  check("non-ASCII subject encoded", msg.includes("Subject: =?UTF-8?B?"));
  check("plain text part", msg.includes('Content-Type: text/plain; charset="UTF-8"') && !msg.includes("multipart"));
  const withFile = decode(buildRawEmail({ to: "a@b.co", subject: "INQ-0002 - Released event proposal", text: "Attached.",
    attachment: { filename: "INQ-0002-proposal.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", base64: "UEsDBA==" } }));
  check("attachment part", withFile.includes("multipart/mixed") && withFile.includes('filename="INQ-0002-proposal.docx"') && withFile.includes("UEsDBA=="));
  let threw = false;
  try { buildRawEmail({ to: "", subject: "x", text: "y" }); } catch { threw = true; }
  check("no address -> refused", threw);
  threw = false;
  try { buildRawEmail({ to: "a@b.co", subject: "x\r\nBcc: client@example.com", text: "y" }); } catch { threw = true; }
  check("header injection refused", threw);
}
check("forward note: never emails clients", /never emails clients/.test(forwardNote("clarification_request", "INQ-0002")) && /Mark as sent/.test(forwardNote("reminder", "INQ-0002")));
check("proposal note: add client details in Word", /add their name and contact details/.test(forwardNote("proposal", "INQ-0002")));

// The materials-log row.
{
  const row = materialsRow("INQ-0002", {
    room: "Grand Ballroom", layout: "Banquet", guest_count: "180",
    tables: ["23 × sixty-inch round tables", "1 × six-foot registration table"], chairs: "180",
    av_equipment: ["1 × wireless microphone", "1 × speaker system"],
  }, "2027-06-19", "2026-11-11T00:00:07Z");
  check("row matches the header", row.length === LOG_HEADER.length);
  check("row values", row.join("|") === "2027-06-19|INQ-0002|Grand Ballroom|Banquet|180|23 × sixty-inch round tables; 1 × six-foot registration table|180|1 × wireless microphone; 1 × speaker system|2026-11-10", row.join("|"));
  check("no AV -> None", materialsRow("INQ-9", { av_equipment: ["None requested"] }, "", "")[7] === "None");
  check("release date in venue time", materialsRow("INQ-9", {}, "", "2026-11-11T00:00:07Z")[8] === "2026-11-10");
}

// Google errors in plain words.
check("expired token", googleProblem(400, { error: "invalid_grant" }).expired === true);
check("401 -> renew", googleProblem(401, {}).expired === true);
check("404 -> check the ID", /ID/.test(googleProblem(404, {}).message));
check("busy -> try again", /try again/.test(googleProblem(503, {}).message));

log(`${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} check(s) failed`);
