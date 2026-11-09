// Automated checks for T4 (filling the Word template) and the code half of T5.
// Run from the repository root with either:
//   deno run --allow-read tests/proposal.test.js
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/proposal.test.js
import {
  applyTailoring, buildTemplateValues, byHandTailoring, checkTailoring, fillDocumentXml, formatClock, formatLongDate, PLACEHOLDERS, TO_CONFIRM,
} from "../supabase/functions/agent/proposal.js";
import { assessSetup } from "../supabase/functions/agent/setup.js";

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

const xml = load("tests/fixtures/proposal-template-document.xml");
check("template has all 16 placeholders", PLACEHOLDERS.every((p) => xml.includes(`{{${p}}}`)), PLACEHOLDERS.filter((p) => !xml.includes(`{{${p}}}`)).join());

const [header, ...lines] = load("our_team_agent/docs/rooms-and-equipment.csv").trim().split("\n");
const keys = header.split(",");
const rooms = lines.map((line) => {
  const cells = line.split(",");
  const row = Object.fromEntries(keys.map((k, i) => [k, cells[i]]));
  return { ...row, name: row.room, active: true, is_example: true };
});
const found = (value) => ({ value: String(value), status: "found", evidence: "" });
const fields = (o) => Object.fromEntries(["event_type", "event_date", "start_time", "end_time", "guest_count", "preferred_layout",
  "room_preference", "av_requests", "catering", "special_requests", "budget"].map((k) => [k, o[k] === undefined ? { value: "", status: "missing", evidence: "" } : found(o[k])]));

check("long date", formatLongDate("2027-03-11") === "Thursday, March 11, 2027");
check("clock", formatClock("09:00") === "9:00 AM" && formatClock("17:30") === "5:30 PM" && formatClock("12:00") === "12:00 PM" && formatClock("00:15") === "12:15 AM");

// Sample 1: template proposal for the Garden Room.
const f1 = fields({ event_type: "conference or training", event_date: "2027-03-11", start_time: "09:00", end_time: "15:00", guest_count: 45, preferred_layout: "classroom" });
const a1 = assessSetup(f1, rooms, { ok: true, av_items: [{ request: "projector", maps_to: "projector" }], special_requests: [], venue_catering_requested: false, questions: [] });
const room1 = rooms.find((r) => r.name === a1.room);
const v1 = buildTemplateValues("INQ-0042", f1, a1, room1, "2026-11-09");
{
  check("values: header", v1.inquiry_id === "INQ-0042" && v1.proposal_date === "Monday, November 9, 2026");
  check("values: event", v1.event_type === "Conference or training" && v1.event_date === "Thursday, March 11, 2027" && v1.start_time === "9:00 AM" && v1.end_time === "3:00 PM");
  check("values: room and notes", v1.room === "Garden Room" && v1.room_notes === "Opens onto the Terrace");
  check("values: tables list", v1.tables.join("|") === "23 × six-foot tables|1 × six-foot presenter table", v1.tables.join("|"));
  check("values: chairs", v1.chairs === "45");
  check("values: AV", v1.av_equipment.join("|") === "1 × projector|1 × screen or display|1 × wireless microphone", v1.av_equipment.join("|"));
  check("values: nothing to confirm", v1.unresolved_items.join() === "None", v1.unresolved_items.join("|"));
  const out = fillDocumentXml(xml, v1);
  check("filled XML has no placeholders", !/\{\{/.test(out));
  check("filled XML has the values", out.includes("Garden Room") && out.includes("INQ-0042") && out.includes("Thursday, March 11, 2027"));
  check("lists become line breaks", out.includes("23 × six-foot tables</w:t><w:br/><w:t xml:space=\"preserve\">1 × six-foot presenter table"));
}
// Missing value -> [TO CONFIRM] and listed.
{
  const v = buildTemplateValues("INQ-0042", f1, a1, { notes: "" }, "2026-11-09");
  check("empty room notes -> [TO CONFIRM]", v.room_notes === TO_CONFIRM);
  check("and listed under items to confirm", v.unresolved_items.includes("Room notes: to be confirmed."), v.unresolved_items.join("|"));
}
// Special characters are escaped.
{
  const out = fillDocumentXml(xml, { ...v1, room_notes: "Stage & dance floor <north side>" });
  check("XML escaping", out.includes("Stage &amp; dance floor &lt;north side&gt;"));
}
// Tailoring places only the tailored sections.
{
  const t = applyTailoring(v1, {
    room_notes: "The Grand Ballroom suits a seated dinner with space for dancing.",
    setup_requirements: ["Dance floor area in front of the DJ", "DJ setup space near power"],
    extra_items_to_confirm: ["Livestream provider and connection"],
    extra_assumptions: ["The florist arrives in the afternoon"],
  });
  check("tailored room notes placed", t.room_notes.startsWith("The Grand Ballroom suits"));
  check("tailored setup placed", t.setup_requirements.length === 2);
  check("standard sections unchanged", t.tables === v1.tables && t.chairs === v1.chairs && t.event_date === v1.event_date);
  check("items to confirm added, 'None' dropped", t.unresolved_items.join("|") === "Livestream provider and connection", t.unresolved_items.join("|"));
}
// By-hand fallback.
{
  const t = byHandTailoring(v1, ["Dance floor", "Livestream"]);
  check("by-hand markers", t.room_notes.startsWith("[TO CONFIRM") && t.setup_requirements.some((s) => s.includes("Dance floor")));
}
// Fact checks on the AI's text.
{
  const source = JSON.stringify(a1) + " 2027-06-19 180 guests 5:00 PM to 11:00 PM";
  check("clean tailoring passes", checkTailoring({ room_notes: "Round tables for 180 guests.", setup_requirements: ["Dance floor near the DJ"] }, source).ok);
  check("price caught", !checkTailoring({ room_notes: "The dance floor costs $500." }, source).ok);
  check("invented number caught", !checkTailoring({ room_notes: "Seats up to 260 guests." }, source).ok);
  check("phone caught", !checkTailoring({ setup_requirements: ["Call (805) 555-0142"] }, source).ok);
}

log(`${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} check(s) failed`);
