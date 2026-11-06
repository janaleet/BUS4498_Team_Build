// T3 · Identify event setup needs (calculate_setup_needs) and D2 · Use template?
// Fixed rules in code, not the AI model. Source: our_team_agent/docs/setup-and-routing-rules.md
// sections 4 and 5 (example data). The AI only sorts the client's AV and special
// requests (flag_setup_questions); every count, room choice, and route is decided here.

export const TEMPLATE_EVENT_TYPES = [
  "corporate meeting",
  "conference or training",
  "birthday party",
  "holiday party",
  "baby or bridal shower",
];

// Standard AV by event type (section 4).
const STANDARD_AV = {
  "corporate meeting": { projector: 1, screen: 1 },
  "conference or training": { projector: 1, screen: 1, wireless_mic: 1 },
  "birthday party": { speaker_system: 1 },
  "holiday party": { speaker_system: 1, wireless_mic: 1 },
  "baby or bridal shower": { speaker_system: 1 },
};

export const AV_KINDS = ["projector", "screen", "wireless_mic", "speaker_system", "video_conferencing"];
const AV_LABELS = {
  projector: "Projector",
  screen: "Screen or display",
  wireless_mic: "Wireless microphone",
  speaker_system: "Speaker system",
  video_conferencing: "Video conferencing",
};
const LAYOUT_LABELS = { theater: "theater", classroom: "classroom", banquet: "banquet", reception: "reception", boardroom: "boardroom" };

/** Map the T1 event type to one of the template list names, or return it unchanged. */
export function normalizeEventType(value) {
  const v = String(value || "").toLowerCase().trim();
  if (TEMPLATE_EVENT_TYPES.includes(v)) return v;
  if (/baby shower|bridal shower/.test(v)) return "baby or bridal shower";
  if (/conference|training|workshop|seminar/.test(v)) return "conference or training";
  if (/birthday/.test(v)) return "birthday party";
  if (/holiday/.test(v)) return "holiday party";
  if (/corporate|business|board|team meeting|offsite/.test(v) && !/gala|wedding|reception|fundraiser/.test(v)) return "corporate meeting";
  return v;
}

/** Room stock from a rooms-table row (or CSV row) as numbers and booleans. */
function stock(room) {
  const n = (v) => Number(v) || 0;
  const yes = (v) => v === true || String(v).toLowerCase() === "yes" || String(v).toLowerCase() === "true";
  return {
    six_ft_tables: n(room.six_ft_tables),
    round_tables_60in: n(room.round_tables_60in),
    cocktail_tables: n(room.cocktail_tables),
    chairs: n(room.chairs),
    projector: n(room.projectors),
    screen: n(room.screens_or_displays),
    wireless_mic: n(room.wireless_mics),
    speaker_system: yes(room.speaker_system) ? 1 : 0,
    video_conferencing: yes(room.video_conferencing) ? 1 : 0,
  };
}

const capacity = (room, layout) => Number(room[`${layout}_capacity`]) || 0;

/** Smallest active room whose capacity for the layout is at least the guest count (section 4). */
export function chooseRoom(rooms, layout, guests) {
  const fitting = rooms
    .filter((r) => r.active !== false && capacity(r, layout) >= guests)
    .sort((a, b) => capacity(a, layout) - capacity(b, layout) || String(a.name).localeCompare(String(b.name)));
  return fitting[0] || null;
}

/**
 * calculate_setup_needs + D2.
 * fields: the T1/D1 fields ({ value, status } per name). rooms: active room rows.
 * requests: the result of flag_setup_questions, or null when it was not run or failed:
 *   { ok: true, av_items: [{ request, maps_to }], special_requests: [{ request, covered_by_rules }], questions: [] }
 * Returns the assessment, with route: "template" | "tailored" | "clarify" | "held".
 */
export function assessSetup(fields, rooms, requests) {
  const value = (name) => (fields[name] && fields[name].status === "found" ? String(fields[name].value) : "");
  const guests = Number(value("guest_count"));
  const layout = value("preferred_layout");
  const eventType = normalizeEventType(value("event_type"));
  const unresolved = [];
  const assumptions = [];
  const shortages = [];
  const questions = [];

  // Room (section 4): smallest room that fits; a named room that is too small is noted.
  const room = chooseRoom(rooms, layout, guests);
  const preference = value("room_preference");
  const named = preference ? rooms.find((r) => preference.toLowerCase().includes(String(r.name).toLowerCase())) : null;
  if (!room) {
    const best = rooms.filter((r) => r.active !== false).sort((a, b) => capacity(b, layout) - capacity(a, layout))[0];
    unresolved.push(best && capacity(best, layout) > 0
      ? `No room fits ${guests} guests in a ${LAYOUT_LABELS[layout] || layout} layout; the largest is the ${best.name} at ${capacity(best, layout)}.`
      : `No room offers a ${LAYOUT_LABELS[layout] || layout} layout.`);
    questions.push(`How would the client like to proceed with ${guests} guests (a smaller guest count, or a different layout)?`);
  } else if (named && named.name !== room.name) {
    if (capacity(named, layout) < guests) {
      unresolved.push(`The client asked for the ${named.name}, which seats ${capacity(named, layout)} in a ${layout} layout; the ${room.name} is recommended instead.`);
    } else {
      assumptions.push(`The client mentioned the ${named.name}; the rules recommend the smallest room that fits, the ${room.name}.`);
    }
  }
  const have = room ? stock(room) : null;

  // Tables and chairs (section 4), rounded up.
  const tables = [];
  let chairs = null;
  if (room) {
    const add = (item, kind, qty, source) => tables.push({ item, kind, qty, status: "needed", source });
    if (layout === "theater") add("Six-foot presenter table", "six_ft_tables", 1, "Theater layout: 1 presenter table");
    if (layout === "classroom") {
      add("Six-foot tables", "six_ft_tables", Math.ceil(guests / 2), `Classroom layout: ${guests} guests ÷ 2, rounded up`);
      add("Six-foot presenter table", "six_ft_tables", 1, "Classroom layout: 1 presenter table");
    }
    if (layout === "banquet") add("Sixty-inch round tables", "round_tables_60in", Math.ceil(guests / 8), `Banquet layout: ${guests} guests ÷ 8, rounded up`);
    if (layout === "reception") add("Cocktail tables", "cocktail_tables", Math.ceil(guests / 10), `Reception layout: ${guests} guests ÷ 10, rounded up`);
    if (layout === "boardroom") add("Fixed boardroom table", "fixed", 1, "Boardroom layout: fixed table");
    if (guests > 50) add("Six-foot registration table", "six_ft_tables", 1, "More than 50 guests: 1 registration table");
    // Catering from the venue: the AI's reading when it ran, otherwise the T1 catering field.
    const cateringText = fields.catering && fields.catering.status === "found" ? fields.catering.value : "";
    const venueCatering = requests && requests.ok && typeof requests.venue_catering_requested === "boolean"
      ? requests.venue_catering_requested
      : Boolean(cateringText);
    if (venueCatering) {
      add("Six-foot food and beverage table", "six_ft_tables", 1, `Catering requested from the venue: "${cateringText || "yes"}"`);
    } else if (cateringText) {
      assumptions.push(`Food: "${cateringText}" — catering was not requested from the venue, so no food and beverage table.`);
    }
    chairs = {
      qty: layout === "reception" ? Math.ceil(guests * 0.3) : guests,
      status: "needed",
      source: layout === "reception" ? `Reception layout: ${guests} guests × 0.3, rounded up` : `${LAYOUT_LABELS[layout]} layout: one chair per guest`,
    };

    // Stock check: fewer tables or chairs than needed is held for an employee (team decision).
    const needed = {};
    for (const t of tables) if (t.kind !== "fixed") needed[t.kind] = (needed[t.kind] || 0) + t.qty;
    needed.chairs = chairs.qty;
    const names = { six_ft_tables: "six-foot tables", round_tables_60in: "sixty-inch round tables", cocktail_tables: "cocktail tables", chairs: "chairs" };
    for (const [kind, qty] of Object.entries(needed)) {
      if (qty > have[kind]) shortages.push(`The ${room.name} has ${have[kind]} ${names[kind]}; ${qty} needed.`);
    }
  }

  // AV (section 4): standard by event type, the over-100 rule, then the client's requests.
  const av = {};
  for (const kind of AV_KINDS) av[kind] = { item: AV_LABELS[kind], qty: 0, status: "not needed", source: [] };
  const want = (kind, qty, source) => {
    av[kind].qty = Math.max(av[kind].qty, 0) + qty;
    av[kind].status = "needed";
    av[kind].source.push(source);
  };
  for (const [kind, qty] of Object.entries(STANDARD_AV[eventType] || {})) want(kind, qty, `Standard AV for a ${eventType}`);
  if (guests > 100) {
    want("wireless_mic", 1, "More than 100 guests: 1 extra wireless mic");
    if (av.speaker_system.qty === 0) want("speaker_system", 1, "More than 100 guests: the room's speaker system");
    else av.speaker_system.source.push("More than 100 guests: the room's speaker system");
  }
  const otherAv = [];
  const requestsChecked = Boolean(requests && requests.ok);
  if (requestsChecked) {
    for (const item of requests.av_items || []) {
      const kind = item.maps_to;
      if (AV_KINDS.includes(kind)) {
        if (av[kind].status === "needed") av[kind].source.push(`Client request: "${item.request}"`);
        else want(kind, 1, `Client request: "${item.request}"`);
      } else {
        otherAv.push({ item: item.request, qty: 1, status: "unknown", source: [`Client request: "${item.request}" — not in the venue's equipment list`] });
        unresolved.push(`"${item.request}" is not in the venue's equipment list.`);
        questions.push(`Can the client bring "${item.request}", or is it essential?`);
      }
    }
  }
  const avList = [];
  for (const kind of AV_KINDS) {
    const line = av[kind];
    if (line.status === "needed" && room && line.qty > have[kind]) {
      line.status = "unknown";
      line.source.push(`The ${room.name} has ${have[kind]}`);
      unresolved.push(`${line.item}: ${line.qty} needed, the ${room.name} has ${have[kind]}.`);
    }
    if (line.status === "not needed") line.source.push(`Not standard for a ${eventType || "this event"} and not requested`);
    avList.push({ ...line, source: line.source.join("; ") });
  }
  for (const line of otherAv) avList.push({ ...line, source: line.source.join("; ") });

  // Special requests (section 5): anything the formulas don't cover, plus an end time after 11:00 PM.
  const special = [];
  if (requestsChecked) {
    for (const s of requests.special_requests || []) if (!s.covered_by_rules) special.push(s.request);
    for (const q of requests.questions || []) if (!questions.includes(q)) questions.push(q);
  } else if (fields.special_requests && fields.special_requests.status === "found") {
    special.push(fields.special_requests.value);
  }
  const end = value("end_time");
  if (end && end > "23:00") special.push(`End time after 11:00 PM (${end})`);

  // Setup and teardown: the rules give no times, so this is an assumption for T6 to check.
  const setupTeardown = {
    status: "needed",
    value: "Setup before and teardown after the event",
    source: "Assumption: the rules give no setup or teardown times; confirm in review",
  };
  assumptions.push("Setup and teardown times are not set by the rules.");

  // D2 · Use template? (section 5) — then the route.
  const onTemplateList = TEMPLATE_EVENT_TYPES.includes(eventType);
  const fitsStandardLayout = Boolean(room);
  const unknownItems = avList.some((a) => a.status === "unknown");
  let route;
  if (!room) route = "clarify";
  else if (shortages.length) route = "held";
  else if (unknownItems) route = "clarify";
  else route = onTemplateList && fitsStandardLayout && special.length === 0 ? "template" : "tailored";

  return {
    event_type: eventType,
    guest_count: guests,
    layout,
    room: room ? room.name : null,
    room_capacity: room ? capacity(room, layout) : null,
    room_is_example: room ? room.is_example !== false : null,
    tables,
    chairs,
    av: avList,
    setup_teardown: setupTeardown,
    unresolved,
    assumptions,
    shortages,
    questions,
    on_template_list: onTemplateList,
    fits_standard_layout: fitsStandardLayout,
    special_requests: special,
    special_requests_checked: requestsChecked,
    route,
  };
}

/** Plain-language reasons for the route. */
export function setupReasons(a) {
  const d2 = `D2 checks: event type on the template list ${a.on_template_list ? "yes" : "no"}; fits a standard layout ${a.fits_standard_layout ? "yes" : "no"}; special requests ${a.special_requests.length ? a.special_requests.join("; ") : "none"}.`;
  if (a.route === "clarify") return [...a.unresolved, "Next: Task 2, a clarification request to the client."];
  if (a.route === "held") return [...a.shortages, "Held for an employee to decide (rent more, change room, or ask the client)."];
  const lead = a.route === "template"
    ? `Template suitable: ${a.room} (${a.layout} ${a.room_capacity}). Next: Task 4, template proposal.`
    : `Tailoring needed: ${a.room} (${a.layout} ${a.room_capacity}). Next: Task 5, tailored proposal.`;
  const notes = a.special_requests_checked ? [] : ["Special requests not checked – review in T6."];
  return [lead, d2, ...notes, ...a.unresolved];
}
