// D1 · Sufficient event details?
// Code, not the AI model, checks each required field and makes the routing
// decision. See our_team_agent/docs/setup-and-routing-rules.md, sections 1 and 3.

export const REQUIRED_FIELDS = [
  "event_type",
  "event_date",
  "start_time",
  "end_time",
  "guest_count",
  "preferred_layout",
];
export const OPTIONAL_FIELDS = ["room_preference", "av_requests", "catering", "special_requests", "budget"];
export const LAYOUTS = ["theater", "classroom", "banquet", "reception", "boardroom"];

const STATUSES = ["found", "missing", "conflicting"];

/** "2027-03-11" -> true only for a real calendar date. */
function isCalendarDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** "09:00", "9:00 AM", "3 pm" -> minutes after midnight, or null. */
export function parseClockTime(value) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp]\.?\s*[Mm]\.?)?\s*$/.exec(value);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (minutes > 59) return null;
  if (m[3]) {
    if (hours < 1 || hours > 12) return null;
    const pm = /^[Pp]/.test(m[3]);
    hours = (hours % 12) + (pm ? 12 : 0);
  } else if (!m[2] || hours > 23) {
    return null; // a bare "9" is too unclear without AM/PM
  }
  return hours * 60 + minutes;
}

/** 540 -> "09:00" */
function formatClockTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function clean(raw) {
  const value = raw && typeof raw.value === "string" ? raw.value.trim() : raw && raw.value != null ? String(raw.value).trim() : "";
  const status = raw && STATUSES.includes(raw.status) ? raw.status : value ? "found" : "missing";
  const evidence = raw && typeof raw.evidence === "string" ? raw.evidence.trim() : "";
  return { value, status, evidence, note: "" };
}

function downgrade(field, status, note) {
  field.status = status;
  field.note = note;
}

/**
 * Check the six required fields and the optional fields with fixed rules.
 * `raw` is { field_name: { value, status, evidence } } from the AI model or the
 * employee's form. `sourceText` is the de-identified inquiry, used to confirm
 * that each supporting sentence really appears in it.
 * Returns { fields, d1_result: "sufficient" | "missing", missing_fields }.
 */
export function checkEventDetails(raw, sourceText = "") {
  const fields = {};
  for (const name of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) {
    fields[name] = clean(raw ? raw[name] : undefined);
    if (fields[name].status === "missing") fields[name].value = "";
  }

  const f = fields;
  if (f.event_type.status === "found" && !f.event_type.value) downgrade(f.event_type, "missing", "No event type given.");

  if (f.event_date.status === "found" && !isCalendarDate(f.event_date.value)) {
    downgrade(f.event_date, "missing", "Not a single calendar date (YYYY-MM-DD).");
  }

  for (const name of ["start_time", "end_time"]) {
    if (f[name].status !== "found") continue;
    const minutes = parseClockTime(f[name].value);
    if (minutes === null) downgrade(f[name], "missing", "Not a clear clock time.");
    else f[name].value = formatClockTime(minutes);
  }
  if (f.start_time.status === "found" && f.end_time.status === "found" && f.end_time.value <= f.start_time.value) {
    const note = "The end time must be later than the start time.";
    downgrade(f.start_time, "conflicting", note);
    downgrade(f.end_time, "conflicting", note);
  }

  if (f.guest_count.status === "found") {
    const value = f.guest_count.value.replace(/,/g, "");
    if (/\d\s*(?:-|–|—|to|or)\s*\d/i.test(value)) {
      downgrade(f.guest_count, "conflicting", "A range is not one guest count.");
    } else if (!/^\d+$/.test(value) || Number(value) < 1) {
      downgrade(f.guest_count, "missing", "Not one whole number.");
    } else {
      f.guest_count.value = String(Number(value));
    }
  }

  if (f.preferred_layout.status === "found") {
    const layout = f.preferred_layout.value.toLowerCase();
    if (LAYOUTS.includes(layout)) f.preferred_layout.value = layout;
    else downgrade(f.preferred_layout, "conflicting", "Not one of: theater, classroom, banquet, reception, boardroom.");
  }

  for (const name of OPTIONAL_FIELDS) {
    if (fields[name].status === "conflicting") fields[name].status = "found";
  }

  const normalizedSource = sourceText.replace(/\s+/g, " ").toLowerCase();
  for (const field of Object.values(fields)) {
    field.evidence_in_text = field.evidence
      ? normalizedSource.includes(field.evidence.replace(/\s+/g, " ").toLowerCase())
      : false;
  }

  const missing_fields = REQUIRED_FIELDS.filter((name) => fields[name].status !== "found");
  return { fields, d1_result: missing_fields.length === 0 ? "sufficient" : "missing", missing_fields };
}
