// Automated checks for T3 calculate_setup_needs and D2, against
// our_team_agent/docs/sample-inquiries/expected-results.md and
// tests/fixtures/expected-results-synthetic.md, using the example rooms CSV.
// Run from the repository root with either:
//   deno run --allow-read tests/setup.test.js
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/setup.test.js
import { assessSetup, chooseRoom, normalizeEventType } from "../supabase/functions/agent/setup.js";

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

// Rooms from the CSV, shaped like rows of the rooms table.
const [header, ...lines] = load("our_team_agent/docs/rooms-and-equipment.csv").trim().split("\n");
const keys = header.split(",");
const rooms = lines.map((line) => {
  const cells = line.split(",");
  const row = Object.fromEntries(keys.map((k, i) => [k, cells[i]]));
  return { ...row, name: row.room, active: true, is_example: true };
});

const f = (value) => ({ value: String(value), status: "found", evidence: "" });
const m = () => ({ value: "", status: "missing", evidence: "" });
function fields(o) {
  const all = {};
  for (const k of ["event_type", "event_date", "start_time", "end_time", "guest_count", "preferred_layout",
    "room_preference", "av_requests", "catering", "special_requests", "budget"]) all[k] = o[k] === undefined ? m() : f(o[k]);
  return all;
}
const qty = (a, item) => (a.tables.find((t) => t.item === item) || { qty: 0 }).qty;
const avStatus = (a, label) => (a.av.find((x) => x.item === label) || {}).status;
const ok = (av_items = [], special_requests = []) => ({ ok: true, av_items, special_requests, questions: [] });

// Sample 1: conference or training, 45, classroom -> Garden Room, 23 + 1 presenter, 45 chairs, template.
{
  const a = assessSetup(fields({ event_type: "conference or training", end_time: "15:00", guest_count: 45, preferred_layout: "classroom",
    av_requests: "projector and screen" }), rooms,
    ok([{ request: "projector", maps_to: "projector" }, { request: "screen", maps_to: "screen" }]));
  check("sample 1 room", a.room === "Garden Room" && a.room_capacity === 60, a.room);
  check("sample 1 tables", qty(a, "Six-foot tables") === 23 && qty(a, "Six-foot presenter table") === 1, JSON.stringify(a.tables));
  check("sample 1 chairs", a.chairs.qty === 45);
  check("sample 1 no registration table (45 guests)", qty(a, "Six-foot registration table") === 0);
  check("sample 1 AV", avStatus(a, "Projector") === "needed" && avStatus(a, "Wireless microphone") === "needed" && avStatus(a, "Speaker system") === "not needed");
  check("sample 1 route template", a.route === "template", a.route);
}
// Sample 2: wedding reception, 180, banquet -> Grand Ballroom, 23 rounds + 1 registration, 180 chairs, tailored.
{
  const a = assessSetup(fields({ event_type: "wedding reception", end_time: "23:00", guest_count: 180, preferred_layout: "banquet",
    room_preference: "Grand Ballroom", special_requests: "dance floor, DJ, livestream, own florist" }), rooms,
    ok([], [{ request: "dance floor", covered_by_rules: false }, { request: "livestream", covered_by_rules: false },
      { request: "outside florist", covered_by_rules: false }]));
  check("sample 2 room", a.room === "Grand Ballroom" && a.room_capacity === 240, a.room);
  check("sample 2 rounds", qty(a, "Sixty-inch round tables") === 23);
  check("sample 2 registration", qty(a, "Six-foot registration table") === 1);
  check("sample 2 chairs", a.chairs.qty === 180);
  check("sample 2 not on template list", a.on_template_list === false);
  check("sample 2 three special requests", a.special_requests.length === 3, JSON.stringify(a.special_requests));
  check("sample 2 end at 11:00 PM is not 'after'", !a.special_requests.some((s) => /after 11/.test(s)));
  check("sample 2 over 100: mic and speaker", avStatus(a, "Wireless microphone") === "needed" && avStatus(a, "Speaker system") === "needed");
  check("sample 2 route tailored", a.route === "tailored", a.route);
}
// Fixture 4: holiday party, 70, reception, catering -> Terrace, 7 cocktail, 21 chairs, registration + food table.
{
  const a = assessSetup(fields({ event_type: "holiday party", end_time: "22:00", guest_count: 70, preferred_layout: "reception",
    catering: "Catering will be needed" }), rooms, ok());
  check("fixture 4 room", a.room === "Terrace", a.room);
  check("fixture 4 tables", qty(a, "Cocktail tables") === 7 && qty(a, "Six-foot registration table") === 1 && qty(a, "Six-foot food and beverage table") === 1, JSON.stringify(a.tables));
  check("fixture 4 chairs", a.chairs.qty === 21);
  check("fixture 4 route template", a.route === "template", a.route);
}
// Sample 1 again: the client orders their own lunch, so no food and beverage table (expected results).
{
  const a = assessSetup(fields({ event_type: "conference or training", end_time: "15:00", guest_count: 45, preferred_layout: "classroom",
    catering: "We'll arrange our own lunch delivery." }), rooms, { ...ok(), venue_catering_requested: false });
  check("own lunch: no food table", qty(a, "Six-foot food and beverage table") === 0, JSON.stringify(a.tables));
  check("own lunch: noted as an assumption", a.assumptions.some((s) => /not requested from the venue/.test(s)));
  check("own lunch: still template", a.route === "template");
}
// Catering from the venue adds the food and beverage table.
{
  const a = assessSetup(fields({ event_type: "holiday party", end_time: "22:00", guest_count: 70, preferred_layout: "reception",
    catering: "Catering will be needed" }), rooms, { ...ok(), venue_catering_requested: true });
  check("venue catering: food table", qty(a, "Six-foot food and beverage table") === 1);
}
// Fixture 6: holiday party, 280, banquet -> no room fits -> clarify.
{
  const a = assessSetup(fields({ event_type: "holiday party", end_time: "22:00", guest_count: 280, preferred_layout: "banquet" }), rooms, ok());
  check("fixture 6 no room", a.room === null && a.fits_standard_layout === false);
  check("fixture 6 names the largest room", /Grand Ballroom at 240/.test(a.unresolved[0] || ""), a.unresolved[0]);
  check("fixture 6 route clarify", a.route === "clarify");
}
// Fixture 7: conference, 40, classroom, teleprompter + confidence monitor -> Garden Room, unknown AV -> clarify.
{
  const a = assessSetup(fields({ event_type: "conference or training", end_time: "16:30", guest_count: 40, preferred_layout: "classroom",
    av_requests: "projector, screen, teleprompter, confidence monitor" }), rooms,
    ok([{ request: "projector", maps_to: "projector" }, { request: "screen", maps_to: "screen" },
      { request: "teleprompter", maps_to: "other" }, { request: "confidence monitor", maps_to: "other" }]));
  check("fixture 7 room", a.room === "Garden Room");
  check("fixture 7 tables", qty(a, "Six-foot tables") === 20 && qty(a, "Six-foot presenter table") === 1);
  check("fixture 7 two unknown items", a.av.filter((x) => x.status === "unknown").length === 2, JSON.stringify(a.av));
  check("fixture 7 route clarify", a.route === "clarify");
}
// Fixture 8: birthday party, 30, reception -> Studio A, 3 cocktail, 9 chairs, speaker -> template.
{
  const a = assessSetup(fields({ event_type: "birthday party", end_time: "17:00", guest_count: 30, preferred_layout: "reception",
    av_requests: "Music through a speaker" }), rooms, ok([{ request: "speaker for music", maps_to: "speaker_system" }]));
  check("fixture 8 room", a.room === "Studio A");
  check("fixture 8 tables/chairs", qty(a, "Cocktail tables") === 3 && a.chairs.qty === 9);
  check("fixture 8 speaker", avStatus(a, "Speaker system") === "needed");
  check("fixture 8 route template", a.route === "template");
}
// Fixture 9: holiday party, 80, banquet -> Garden Room, 10 rounds + 1 registration, 80 chairs -> template.
{
  const a = assessSetup(fields({ event_type: "holiday party", end_time: "21:30", guest_count: 80, preferred_layout: "banquet",
    av_requests: "One microphone for a toast" }), rooms, ok([{ request: "microphone", maps_to: "wireless_mic" }]));
  check("fixture 9 room", a.room === "Garden Room" && a.room_capacity === 96);
  check("fixture 9 tables", qty(a, "Sixty-inch round tables") === 10 && qty(a, "Six-foot registration table") === 1);
  check("fixture 9 one mic, not two", a.av.find((x) => x.item === "Wireless microphone").qty === 1);
  check("fixture 9 route template", a.route === "template");
}
// Fixture 10: corporate meeting, 16, boardroom -> Studio A (16), projector + screen -> template.
{
  const a = assessSetup(fields({ event_type: "corporate meeting", end_time: "12:00", guest_count: 16, preferred_layout: "boardroom" }), rooms, ok());
  check("fixture 10 room", a.room === "Studio A" && a.room_capacity === 16, a.room);
  check("fixture 10 fixed table", qty(a, "Fixed boardroom table") === 1 && a.chairs.qty === 16);
  check("fixture 10 route template", a.route === "template");
}
// Team decision: a table shortage is held for an employee.
{
  const a = assessSetup(fields({ event_type: "conference or training", end_time: "15:00", guest_count: 60, preferred_layout: "classroom" }), rooms, ok());
  check("shortage: Garden Room classroom 60", a.room === "Garden Room" && a.route === "held", a.route);
  check("shortage reason names the numbers", /30 six-foot tables; 32 needed/.test(a.shortages[0] || ""), a.shortages[0]);
}
// End time after 11:00 PM is a special request.
{
  const a = assessSetup(fields({ event_type: "birthday party", end_time: "23:30", guest_count: 30, preferred_layout: "reception" }), rooms, ok());
  check("after 11 PM -> tailored", a.route === "tailored" && /after 11:00 PM/.test(a.special_requests[0] || ""));
}
// The AI check failed: the T1 special-requests field counts, and the note is shown.
{
  const a = assessSetup(fields({ event_type: "birthday party", end_time: "17:00", guest_count: 30, preferred_layout: "reception",
    special_requests: "a small stage" }), rooms, null);
  check("AI failed -> special requests from T1", a.special_requests_checked === false && a.special_requests[0] === "a small stage");
  check("AI failed -> tailored", a.route === "tailored");
}
// A named room that is too small is listed under unresolved items.
{
  const a = assessSetup(fields({ event_type: "birthday party", end_time: "17:00", guest_count: 45, preferred_layout: "banquet",
    room_preference: "Studio A" }), rooms, ok());
  check("too-small named room noted", a.room === "Terrace" && /Studio A, which seats 32/.test(a.unresolved[0] || ""), JSON.stringify(a.unresolved));
}
// A switched-off room is never chosen.
{
  const off = rooms.map((r) => (r.name === "Studio A" ? { ...r, active: false } : r));
  check("inactive room skipped", chooseRoom(off, "reception", 30).name === "Terrace");
}
check("event type names normalize", normalizeEventType("Baby shower") === "baby or bridal shower" && normalizeEventType("team training") === "conference or training");

log(`${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} check(s) failed`);
