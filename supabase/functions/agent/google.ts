// Google calls for Group 6, with one OAuth sign-in (secrets GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN; scopes gmail.send, calendar.freebusy,
// drive.file). The rules around each call are in google.js and the database.
import { googleProblem, LOG_HEADER, VENUE_TIME_ZONE } from "./google.js";

const TIMEOUT_MS = 20_000;
export type GoogleResult<T> = { ok: true; data: T } | { ok: false; expired: boolean; message: string; status: number };

let cached: { token: string; until: number } | null = null;

export function googleConfigured(): boolean {
  return Boolean(Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_CLIENT_SECRET") && Deno.env.get("GOOGLE_REFRESH_TOKEN"));
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** A short-lived access token from the refresh token (cached until a minute before it ends). */
async function accessToken(): Promise<GoogleResult<string>> {
  if (!googleConfigured()) return { ok: false, expired: false, status: 0, message: "Google isn't connected yet: add the three GOOGLE_ secrets in Supabase — see HANDOFF.md." };
  if (cached && Date.now() < cached.until) return { ok: true, data: cached.token };
  try {
    const res = await timedFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
        refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "",
        grant_type: "refresh_token",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) return { ok: false, status: res.status, ...googleProblem(res.status, body) };
    cached = { token: body.access_token, until: Date.now() + (Number(body.expires_in ?? 3600) - 60) * 1000 };
    return { ok: true, data: body.access_token };
  } catch (e) {
    return { ok: false, expired: false, status: 0, message: `Could not reach Google (${e instanceof Error ? e.message : String(e)}).` };
  }
}

/** One Google API call with the access token; one retry for a busy (429/5xx) answer. */
async function call<T>(url: string, init: RequestInit): Promise<GoogleResult<T>> {
  const token = await accessToken();
  if (!token.ok) return token;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await timedFetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token.data}`, "Content-Type": "application/json" } });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, data: body as T };
      if (attempt === 1 && (res.status === 429 || res.status >= 500)) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      if (res.status === 401) cached = null;
      return { ok: false, status: res.status, ...googleProblem(res.status, body) };
    } catch (e) {
      if (attempt === 2) return { ok: false, expired: false, status: 0, message: `Could not reach Google (${e instanceof Error ? e.message : String(e)}).` };
    }
  }
  return { ok: false, expired: false, status: 0, message: "Google did not answer." };
}

/** Gmail users.messages.send with a ready base64url RFC 2822 message. */
export async function gmailSend(raw: string): Promise<GoogleResult<{ id: string }>> {
  return await call("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw }) });
}

/** Calendar freeBusy for one calendar and one window. */
export async function freeBusy(calendarId: string, timeMin: string, timeMax: string): Promise<GoogleResult<{ start: string; end: string }[]>> {
  const result = await call<{ calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    { method: "POST", body: JSON.stringify({ timeMin, timeMax, timeZone: VENUE_TIME_ZONE, items: [{ id: calendarId }] }) },
  );
  if (!result.ok) return result;
  const cal = result.data.calendars?.[calendarId];
  if (!cal || (cal.errors && cal.errors.length)) {
    return { ok: false, expired: false, status: 404, message: "Google couldn't read that calendar: check the calendar ID and that the connected account can see it." };
  }
  return { ok: true, data: cal.busy ?? [] };
}

/** A new spreadsheet with the log header (the app's own file, under drive.file). */
export async function createLogSheet(): Promise<GoogleResult<{ spreadsheetId: string; spreadsheetUrl: string }>> {
  const created = await call<{ spreadsheetId: string; spreadsheetUrl: string }>("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({ properties: { title: "JEvents materials log" }, sheets: [{ properties: { title: "Log" } }] }),
  });
  if (!created.ok) return created;
  const header = await appendRow(created.data.spreadsheetId, LOG_HEADER);
  if (!header.ok) return header;
  return created;
}

/** Append one row to the log sheet. */
export async function appendRow(spreadsheetId: string, row: string[]): Promise<GoogleResult<{ updates?: { updatedRange?: string } }>> {
  return await call(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent("Log!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
  );
}

/** Whether the sign-in works right now (Settings page). Calls only the token endpoint. */
export async function googleStatus(): Promise<{ configured: boolean; ok: boolean; message: string }> {
  if (!googleConfigured()) return { configured: false, ok: false, message: "Not connected: add the three GOOGLE_ secrets in Supabase — see HANDOFF.md." };
  cached = null;
  const token = await accessToken();
  return token.ok
    ? { configured: true, ok: true, message: "Connected. Testing-mode sign-ins expire after 7 days; renew the token weekly." }
    : { configured: true, ok: false, message: token.message };
}
