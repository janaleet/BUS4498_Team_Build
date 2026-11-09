// T4 · Prepare template proposal (fill_proposal_template) and the code half of
// T5 · Prepare tailored proposal. Code fills the 16 {{placeholders}} of the approved
// Word template (our_team_agent/docs/proposal-template.docx). The AI (tailor.ts) only
// writes the tailored sections for T5; code places them, so standard sections stay the same.

export const PLACEHOLDERS = [
  "inquiry_id", "proposal_date", "event_type", "event_date", "start_time", "end_time", "guest_count", "layout",
  "room", "room_notes", "tables", "chairs", "av_equipment", "setup_requirements", "unresolved_items", "assumptions",
];
export const TO_CONFIRM = "[TO CONFIRM]";
export const BY_HAND = "[TO CONFIRM – write by hand]";

// Sections an employee may edit by hand (and the AI writes for T5).
export const EDITABLE = ["room_notes", "setup_requirements", "unresolved_items", "assumptions"];

const LABELS = {
  event_type: "Event type", event_date: "Event date", start_time: "Start time", end_time: "End time",
  guest_count: "Guest count", layout: "Layout", room: "Room", room_notes: "Room notes", tables: "Tables",
  chairs: "Chairs", av_equipment: "AV equipment", setup_requirements: "Setup and teardown",
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "2027-06-19" -> "Saturday, June 19, 2027" */
export function formatLongDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .format(new Date(`${iso}T12:00:00Z`));
}

/** "17:00" -> "5:00 PM" */
export function formatClock(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Values for every placeholder, from the T1 fields and the T3 assessment.
 * Lists are arrays (one line each in Word). An empty value becomes [TO CONFIRM] and is
 * added to the items to confirm, as the T4 spec requires.
 */
export function buildTemplateValues(inquiryId, fields, assessment, room, todayIso) {
  const f = (n) => (fields[n] && fields[n].status === "found" ? String(fields[n].value) : "");
  const neededAv = (assessment.av || []).filter((a) => a.status === "needed");
  const values = {
    inquiry_id: inquiryId,
    proposal_date: formatLongDate(todayIso),
    event_type: cap(f("event_type")),
    event_date: formatLongDate(f("event_date")),
    start_time: formatClock(f("start_time")),
    end_time: formatClock(f("end_time")),
    guest_count: f("guest_count"),
    layout: cap(assessment.layout || f("preferred_layout")),
    room: assessment.room || "",
    room_notes: room && room.notes ? room.notes : "",
    tables: (assessment.tables || []).map((t) => (t.kind === "fixed" ? t.item : `${t.qty} × ${t.item.toLowerCase()}`)),
    chairs: assessment.chairs ? String(assessment.chairs.qty) : "",
    av_equipment: neededAv.length ? neededAv.map((a) => `${a.qty} × ${a.item.toLowerCase()}`) : ["None requested"],
    setup_requirements: [assessment.setup_teardown ? `${assessment.setup_teardown.value} (times to be confirmed)` : ""].filter(Boolean),
    unresolved_items: [...(assessment.unresolved || [])],
    assumptions: (assessment.assumptions || []).filter(Boolean),
  };
  return markMissing(values);
}

/** Any empty value shows [TO CONFIRM] and is listed under items to confirm. */
export function markMissing(values) {
  const out = { ...values, unresolved_items: [...(values.unresolved_items || [])] };
  for (const key of PLACEHOLDERS) {
    if (key === "unresolved_items" || key === "assumptions") continue;
    const v = out[key];
    const empty = Array.isArray(v) ? v.length === 0 || v.every((x) => !String(x).trim()) : !String(v ?? "").trim();
    if (empty) {
      out[key] = TO_CONFIRM;
      const line = `${LABELS[key] || key}: to be confirmed.`;
      if (!out.unresolved_items.includes(line)) out.unresolved_items.push(line);
    }
  }
  if (!out.unresolved_items.length) out.unresolved_items = ["None"];
  if (!out.assumptions || !out.assumptions.length) out.assumptions = ["None"];
  return out;
}

/**
 * Place the AI's tailored sections (T5) into the values. Standard sections are untouched.
 * tailored: { room_notes, setup_requirements: [], extra_items_to_confirm: [], extra_assumptions: [] }
 */
export function applyTailoring(values, tailored) {
  const out = { ...values };
  if (tailored.room_notes && tailored.room_notes.trim()) out.room_notes = tailored.room_notes.trim();
  if (Array.isArray(tailored.setup_requirements) && tailored.setup_requirements.length) out.setup_requirements = tailored.setup_requirements;
  const base = (values.unresolved_items || []).filter((x) => x !== "None");
  out.unresolved_items = [...base, ...(tailored.extra_items_to_confirm || [])];
  const assumptions = (values.assumptions || []).filter((x) => x !== "None");
  out.assumptions = [...assumptions, ...(tailored.extra_assumptions || [])];
  return markMissing(out);
}

/** When the AI cannot tailor, the tailored sections say to write them by hand. */
export function byHandTailoring(values, specialRequests) {
  return applyTailoring(values, {
    room_notes: BY_HAND,
    setup_requirements: [BY_HAND, ...specialRequests.map((s) => `Special request to address: ${s}`)],
    extra_items_to_confirm: ["Tailored sections: write by hand before review."],
    extra_assumptions: [],
  });
}

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Replace each {{placeholder}} in the template's document.xml. A list becomes one line per
 * item (a Word line break inside the same paragraph). Throws if any placeholder is left.
 */
export function fillDocumentXml(xml, values) {
  let out = xml;
  for (const key of PLACEHOLDERS) {
    const v = values[key];
    const text = Array.isArray(v)
      ? v.map(escapeXml).join('</w:t><w:br/><w:t xml:space="preserve">')
      : escapeXml(v ?? TO_CONFIRM);
    out = out.split(`{{${key}}}`).join(text);
  }
  const left = out.match(/\{\{\s*\w+\s*\}\}/g);
  if (left) throw new Error(`Placeholders left unfilled: ${[...new Set(left)].join(", ")}`);
  return out;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const PRICE = /[$€£]|\b\d[\d,.]*\s*(?:dollars|usd)\b|\b(?:price|pricing|cost|costs|fee|fees|deposit|quote|quoted)\b/i;

/**
 * Check the AI's tailored text adds no facts (T5 rule): no prices, no contact details,
 * and every number in it must already appear in the inquiry or the setup assessment.
 */
export function checkTailoring(tailored, sourceText) {
  const problems = [];
  const parts = [
    tailored.room_notes || "",
    ...(tailored.setup_requirements || []),
    ...(tailored.extra_items_to_confirm || []),
    ...(tailored.extra_assumptions || []),
    ...((tailored.deviations || []).map((d) => `${d.change || ""} ${d.d2_reason || ""}`)),
  ];
  const text = parts.join("\n");
  if (PRICE.test(text)) problems.push("The tailored text mentions a price or cost.");
  if (EMAIL.test(text)) problems.push("The tailored text contains an email address.");
  if (PHONE.test(text)) problems.push("The tailored text contains a phone number.");
  const allowed = new Set((sourceText.match(/\d+/g) || []).map((n) => String(Number(n))));
  const extra = [...new Set((text.match(/\d+/g) || []).map((n) => String(Number(n))).filter((n) => !allowed.has(n)))];
  if (extra.length) problems.push(`The tailored text has numbers not in the inquiry or assessment: ${extra.join(", ")}.`);
  return { ok: problems.length === 0, problems };
}
