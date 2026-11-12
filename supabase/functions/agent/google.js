// Group 6 — the fixed parts of the Google tools, in code (google.ts makes the calls).
// Gmail: build the message the agent emails to an employee (never a client).
// Calendar: turn the event's date and hours into a free/busy window, and decide "booked".
// Sheets: the one materials-log row for a released proposal (no client details).

export const VENUE_TIME_ZONE = "America/Los_Angeles";
export const LOG_HEADER = ["Event date", "Inquiry ID", "Room", "Layout", "Guests", "Tables", "Chairs", "AV equipment", "Released"];

/** "-07:00" for the venue's time zone on that date (handles daylight saving time). */
export function venueOffset(dateIso) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: VENUE_TIME_ZONE, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${dateIso}T12:00:00Z`)).find((p) => p.type === "timeZoneName");
  const m = /GMT([+-]\d{2}:\d{2})/.exec(part ? part.value : "");
  return m ? m[1] : "+00:00";
}

/**
 * The free/busy window for the event: its date, start and end (HH:MM, venue time), as
 * RFC 3339 times. An end at or before the start is taken as past midnight (next day).
 */
export function eventWindow(dateIso, start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso || "") || !/^\d{2}:\d{2}$/.test(start || "") || !/^\d{2}:\d{2}$/.test(end || "")) return null;
  const timeMin = `${dateIso}T${start}:00${venueOffset(dateIso)}`;
  let endDate = dateIso;
  if (end <= start) {
    const d = new Date(`${dateIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    endDate = d.toISOString().slice(0, 10);
  }
  const timeMax = `${endDate}T${end}:00${venueOffset(endDate)}`;
  return { timeMin, timeMax };
}

/** Booked when any busy block overlaps the window (touching ends don't count). */
export function isBooked(busy, window) {
  const a = Date.parse(window.timeMin);
  const b = Date.parse(window.timeMax);
  return (busy || []).some((x) => Date.parse(x.start) < b && Date.parse(x.end) > a);
}

/** Base64 of UTF-8 text. */
function b64(text) {
  // UTF-8 bytes as a binary string (works in Deno and in the test runner).
  const utf8 = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
  return btoa(utf8);
}

/** RFC 2047 header word, so subjects with dashes or accents arrive intact. */
function headerWord(text) {
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${b64(text)}?=`;
}

/** Wrap base64 at 76 characters, as MIME expects. */
function wrap(base64) {
  return base64.replace(/(.{76})/g, "$1\r\n");
}

/**
 * The RFC 2822 message for Gmail's users.messages.send, base64url-encoded in "raw".
 * attachment: { filename, contentType, base64 } or null.
 */
export function buildRawEmail({ to, subject, text, attachment }) {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to || "")) throw new Error("No valid address for the employee.");
  if (/[\r\n]/.test(subject)) throw new Error("The subject must be one line.");
  const boundary = `jevents-${Math.random().toString(36).slice(2)}`;
  const lines = [`To: ${to}`, `Subject: ${headerWord(subject)}`, "MIME-Version: 1.0"];
  if (attachment) {
    lines.push(
      `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
      `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap(b64(text)),
      `--${boundary}`, `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`, "Content-Transfer-Encoding: base64", "", wrap(attachment.base64),
      `--${boundary}--`, "");
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrap(b64(text)));
  }
  return b64url(lines.join("\r\n"));
}

/** Base64url of ASCII text (the message is ASCII once its parts are base64). */
function b64url(ascii) {
  return btoa(ascii).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The note above a forwarded message: who it's for and that it isn't sent yet. */
export function forwardNote(kind, inquiryId) {
  if (kind === "proposal") {
    return `Released proposal for ${inquiryId}, attached. Before sending it to the client, add their name and contact details and the venue's details in Word. JEvents never sends proposals to clients.`;
  }
  return `Approved ${kind === "reminder" ? "reminder" : "clarification request"} for ${inquiryId}. Forward it to the client with their name in place of [CLIENT NAME] and yours in place of [EMPLOYEE NAME], keeping ${inquiryId} in the subject. Then click Mark as sent in JEvents. JEvents never emails clients.`;
}

/** The materials-log row for a released proposal: event date, ID, room, setup. */
export function materialsRow(inquiryId, sections, eventDateIso, releasedAt) {
  const list = (v) => (Array.isArray(v) ? v : [v]).filter((x) => x && x !== "None" && x !== "None requested").join("; ");
  return [
    eventDateIso || "",
    inquiryId,
    String(sections.room || ""),
    String(sections.layout || ""),
    String(sections.guest_count || ""),
    list(sections.tables),
    String(sections.chairs || ""),
    list(sections.av_equipment) || "None",
    String(releasedAt || "").slice(0, 10),
  ];
}

/** A Google error in plain words, and whether the token needs renewing. */
export function googleProblem(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body || {});
  if (/invalid_grant/.test(text)) return { expired: true, message: "The Google sign-in has expired (Testing tokens last 7 days). Renew GOOGLE_REFRESH_TOKEN in Supabase — see HANDOFF.md." };
  if (status === 401) return { expired: true, message: "Google refused the sign-in. Renew GOOGLE_REFRESH_TOKEN in Supabase — see HANDOFF.md." };
  if (status === 403) return { expired: false, message: "Google refused access: check that the API is turned on and the permission was granted." };
  if (status === 404) return { expired: false, message: "Google couldn't find the calendar or sheet: check its ID." };
  if (status === 429 || status >= 500) return { expired: false, message: `Google is busy (${status}); try again shortly.` };
  return { expired: false, message: `Google returned an error (${status}).` };
}
