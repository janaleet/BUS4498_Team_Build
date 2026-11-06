// Edge Function: agent
// Carries out T1 · Review supplied event details and the D1 decision
// (Sufficient event details?). Later groups add the next tasks here.
//
// GET  -> status check; calls no AI and saves nothing.
// POST -> JSON body:
//   Test mode (no sign-in needed; saves nothing; counts toward the daily AI limits):
//     { "dry_run": true, "inquiry": "<inquiry text>", "model"?: "<a model in TEST_MODELS>" }
//   Website (signed-in staff only; the sign-in token goes on the x-user-token header):
//     { "action": "preview", "text" }                    removes personal details; saves nothing
//     { "action": "submit", "text", "confirmed": true, "by_hand"?: bool }
//     { "action": "manual", "inquiry_id", "fields" }     six details typed by an employee
// Every answer has ok, status (one word), reasons, dry_run, ms, and usage.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { PersonalDetailsError, removePersonalDetails } from "./pii.js";
import { checkEventDetails, LAYOUTS, REQUIRED_FIELDS } from "./d1.js";
import { EXTRACTION_MODEL, extractEventDetails } from "./extract.ts";
import { findInstructionLikeText } from "./flags.js";

const MAX_TEXT_LENGTH = 20_000;
// Models test mode may compare. Add the models runtime/test-plan.md lists under
// "Models to compare" once the test plan is written.
const TEST_MODELS = [EXTRACTION_MODEL];
const STATUSES = ["sufficient", "missing", "held", "paused", "refused"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info, x-user-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Usage = { model: string | null; input_tokens: number; output_tokens: number };
const noUsage = (): Usage => ({ model: null, input_tokens: 0, output_tokens: 0 });

function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default;
  } catch {
    // fall through to the older variable
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** One answer: always CORS headers, always status/reasons/dry_run/ms/usage. */
function answer(
  started: number,
  httpStatus: number,
  body: { ok: boolean; status: string; reasons: string[]; dry_run: boolean; usage?: Usage } & Record<string, unknown>,
) {
  const payload = { ...body, usage: body.usage ?? noUsage(), ms: Date.now() - started };
  return new Response(JSON.stringify(payload), {
    status: httpStatus,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** The settings the agent must obey, read fresh on every run. */
async function readSettings() {
  const { data, error } = await db.from("settings").select("key, value");
  if (error) throw new Error(`settings not read: ${error.message}`);
  const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  return {
    paused: map.paused === true,
    aiDailyRunLimit: Number(map.ai_daily_run_limit ?? 0),
    testRunsPerDay: Number(map.test_runs_per_day ?? 0),
  };
}

async function alertCoordinator(inquiryId: string | null, problem: string) {
  const { error } = await db.from("coordinator_alerts").insert({ inquiry_id: inquiryId, task: "T1", problem });
  if (error) console.error("coordinator alert not saved", error.message);
}

type Cleaned = { text: string; replaced: Record<string, number>; warnings?: string[] };

/** Remove personal details, or explain in plain words why it could not be done. */
function clean(text: unknown): { result?: Cleaned; refused?: string; held?: string } {
  if (typeof text !== "string" || text.trim() === "") {
    return { refused: "The inquiry is empty. Paste the inquiry text." };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { refused: `The inquiry is too long (over ${MAX_TEXT_LENGTH} characters).` };
  }
  try {
    return { result: removePersonalDetails(text) as Cleaned };
  } catch (error) {
    const why = error instanceof PersonalDetailsError ? error.message : "The personal-details check failed.";
    return { held: `${why} Nothing was saved or sent to the AI. Remove the personal details by hand and try again.` };
  }
}

/** Plain-language reasons for the D1 result. */
function d1Reasons(decision: ReturnType<typeof checkEventDetails>): string[] {
  if (decision.d1_result === "sufficient") {
    return ["All six required details were found and none conflict, so the next step is Task 3 (setup needs)."];
  }
  return decision.missing_fields.map((name: string) => {
    const field = decision.fields[name] ?? {};
    const label = name.replace(/_/g, " ");
    return field.status === "conflicting"
      ? `The ${label} is conflicting${field.value ? ` ("${field.value}")` : ""}; the client must give one value.`
      : `The ${label} is missing.`;
  });
}

function checkedList(settings: Awaited<ReturnType<typeof readSettings>>, model: string | null, replaced?: Record<string, number>) {
  const list = [
    `Setting: Paused = ${settings.paused ? "on" : "off"}`,
    `Setting: daily AI limit = ${settings.aiDailyRunLimit}`,
    "Rules: six required fields and formats (setup-and-routing-rules.md, sections 1–3)",
  ];
  if (replaced) {
    list.push(`Personal-details check: replaced ${replaced.NAME ?? 0} name(s), ${replaced.EMAIL ?? 0} email(s), ${replaced.PHONE ?? 0} phone number(s), ${replaced.ADDRESS ?? 0} address(es)`);
  }
  if (model) list.push(`AI model: ${model}`);
  return list;
}

/** Run extract_event_details with the daily limits and token counting. */
async function runExtraction(text: string, inquiryId: string | null, dryRun: boolean, model: string) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const usage: Usage = { model, input_tokens: 0, output_tokens: 0 };
  if (!apiKey) {
    return { extraction: { ok: false as const, reason: "missing_key", attempts: 0, inputTokens: 0, outputTokens: 0 }, usage };
  }
  let usageId: number | null = null;
  const beforeCall = async () => {
    const { data, error } = await db.rpc("reserve_ai_call", {
      p_task: "T1 extract_event_details",
      p_inquiry_id: inquiryId,
      p_model: model,
      p_dry_run: dryRun,
    });
    if (error) throw new Error(`AI limit check failed: ${error.message}`);
    usageId = data ?? null;
    return usageId !== null;
  };
  const afterCall = async (inputTokens: number, outputTokens: number) => {
    usage.input_tokens += inputTokens;
    usage.output_tokens += outputTokens;
    if (usageId !== null) {
      const { error } = await db.from("ai_usage").update({ input_tokens: inputTokens, output_tokens: outputTokens }).eq("id", usageId);
      if (error) console.error("token count not saved", error.message);
    }
  };
  let extraction: Awaited<ReturnType<typeof extractEventDetails>>;
  try {
    extraction = await extractEventDetails(apiKey, text, beforeCall, afterCall, model);
  } catch (error) {
    extraction = { ok: false, reason: error instanceof Error ? error.message : String(error), attempts: 0, inputTokens: 0, outputTokens: 0 };
  }
  console.log(JSON.stringify({ inquiry: inquiryId, dry_run: dryRun, extraction: extraction.ok ? "ok" : extraction.reason, attempts: extraction.attempts, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens }));
  return { extraction, usage };
}

function extractionHeldReason(reason: string) {
  if (reason === "ai_limit") return "The daily AI limit is reached or the agent is paused, so the AI was not called. Enter the six details by hand.";
  if (reason === "missing_key") return "The AI key is not set up yet (Supabase → Edge Functions → Secrets → ANTHROPIC_API_KEY). Enter the six details by hand.";
  return `The AI could not read this inquiry (${reason}). Enter the six details by hand.`;
}

// ---------------------------------------------------------------------------
// Test mode: decide as usual, save nothing (permission rule 10).
// ---------------------------------------------------------------------------
async function handleDryRun(started: number, body: Record<string, unknown>) {
  const base = { dry_run: true, inquiry_id: null };
  const model = body.model === undefined ? EXTRACTION_MODEL : body.model;
  if (typeof model !== "string" || !TEST_MODELS.includes(model)) {
    return answer(started, 400, { ...base, ok: false, status: "refused", reasons: [`Test mode can only use these models: ${TEST_MODELS.join(", ")}.`] });
  }
  const settings = await readSettings();
  if (settings.paused) {
    return answer(started, 200, { ...base, ok: true, status: "paused", reasons: ["The agent is paused by a reviewer. It called no AI and saved nothing."], checked: checkedList(settings, null) });
  }
  const cleaned = clean(body.inquiry ?? body.text);
  if (cleaned.refused) return answer(started, 400, { ...base, ok: false, status: "refused", reasons: [cleaned.refused] });
  if (cleaned.held) return answer(started, 200, { ...base, ok: true, status: "held", reasons: [cleaned.held] });
  const { text, replaced } = cleaned.result!;
  const flags = findInstructionLikeText(text);
  const flagReasons = flags.map((line) => `Flagged for a person, not followed: "${line}"`);

  const { extraction, usage } = await runExtraction(text, null, true, model);
  if (!extraction.ok) {
    return answer(started, 200, { ...base, ok: true, status: "held", reasons: [extractionHeldReason(extraction.reason), ...flagReasons], usage, flags, checked: checkedList(settings, model, replaced) });
  }
  const decision = checkEventDetails(extraction.fields, text);
  return answer(started, 200, {
    ...base,
    ok: true,
    status: decision.d1_result,
    reasons: [...d1Reasons(decision), ...flagReasons],
    usage,
    fields: decision.fields,
    missing_fields: decision.missing_fields,
    flags,
    checked: checkedList(settings, model, replaced),
  });
}

// ---------------------------------------------------------------------------
// Website actions (signed-in staff)
// ---------------------------------------------------------------------------

/** Save the D1 result on the submission and the inquiry. */
async function saveDecision(
  inquiryId: string,
  submissionId: number,
  submissionUpdate: Record<string, unknown>,
  decision: ReturnType<typeof checkEventDetails>,
) {
  const nextStep = decision.d1_result === "sufficient" ? "t3_setup_needs" : "t2_clarification";
  const { error: submissionError } = await db
    .from("inquiry_submissions")
    .update({ ...submissionUpdate, fields: decision.fields, d1_result: decision.d1_result, missing_fields: decision.missing_fields })
    .eq("id", submissionId);
  if (submissionError) throw new Error(`submission not updated: ${submissionError.message}`);
  const { error: inquiryError } = await db
    .from("inquiries")
    .update({ d1_result: decision.d1_result, next_step: nextStep })
    .eq("id", inquiryId);
  if (inquiryError) throw new Error(`inquiry not updated: ${inquiryError.message}`);
  return nextStep;
}

async function handleSubmit(started: number, body: Record<string, unknown>, userId: string) {
  const base = { dry_run: false };
  if (body.confirmed !== true) {
    return answer(started, 400, { ...base, ok: false, status: "refused", reasons: ["Confirm that no client personal details remain before submitting."], error: "Confirm that no client personal details remain before submitting." });
  }
  const settings = await readSettings();
  if (settings.paused) {
    return answer(started, 200, { ...base, ok: false, status: "paused", reasons: ["The agent is paused by a reviewer. Nothing was saved."], error: "The agent is paused. Nothing was saved. Ask a reviewer to switch Paused off in Settings." });
  }
  const cleaned = clean(body.text);
  if (cleaned.refused) return answer(started, 400, { ...base, ok: false, status: "refused", reasons: [cleaned.refused], error: cleaned.refused });
  if (cleaned.held) return answer(started, 422, { ...base, ok: false, status: "held", reasons: [cleaned.held], error: cleaned.held });
  const { text, replaced } = cleaned.result!;
  const byHand = body.by_hand === true;
  const flags = findInstructionLikeText(text);

  const { data: startedRows, error: startError } = await db.rpc("start_inquiry", {
    p_deidentified_text: text,
    p_placeholders_replaced: replaced,
    p_extraction_method: byHand ? "by_hand" : "claude",
    p_submitted_by: userId,
    p_flags: flags,
  });
  if (startError || !startedRows?.length) throw new Error(`inquiry not created: ${startError?.message}`);
  const { inquiry_id: inquiryId, submission_id: submissionId } = startedRows[0];
  const flagReasons = flags.map((line) => `Flagged for a person, not followed: "${line}"`);
  if (flags.length) await alertCoordinator(inquiryId, `Inquiry text tried to instruct the agent: ${flags.join(" / ")}`);

  if (byHand) {
    await db.from("inquiry_submissions").update({ checked: checkedList(settings, null, replaced) }).eq("id", submissionId);
    return answer(started, 200, { ...base, ok: true, status: "held", reasons: ["The employee chose to enter the six details by hand.", ...flagReasons], inquiry_id: inquiryId, next_step: "enter_details_by_hand" });
  }

  const { extraction, usage } = await runExtraction(text, inquiryId, false, EXTRACTION_MODEL);
  const checked = checkedList(settings, EXTRACTION_MODEL, replaced);
  if (!extraction.ok) {
    const reason = extractionHeldReason(extraction.reason);
    await db
      .from("inquiry_submissions")
      .update({ extraction_status: "failed", extraction_error: extraction.reason, model: EXTRACTION_MODEL, checked })
      .eq("id", submissionId);
    await db.from("inquiries").update({ next_step: "enter_details_by_hand" }).eq("id", inquiryId);
    await alertCoordinator(inquiryId, `Task 1 extraction failed: ${extraction.reason}`);
    return answer(started, 200, { ...base, ok: true, status: "held", reasons: [reason, ...flagReasons], usage, inquiry_id: inquiryId, next_step: "enter_details_by_hand", notice: reason });
  }

  const decision = checkEventDetails(extraction.fields, text);
  const nextStep = await saveDecision(inquiryId, submissionId, { extraction_status: "succeeded", model: EXTRACTION_MODEL, checked }, decision);
  return answer(started, 200, { ...base, ok: true, status: decision.d1_result, reasons: [...d1Reasons(decision), ...flagReasons], usage, inquiry_id: inquiryId, d1_result: decision.d1_result, next_step: nextStep });
}

async function handleManual(started: number, body: Record<string, unknown>) {
  const base = { dry_run: false };
  const refuse = (httpStatus: number, message: string) =>
    answer(started, httpStatus, { ...base, ok: false, status: "refused", reasons: [message], error: message });

  const settings = await readSettings();
  if (settings.paused) {
    return answer(started, 200, { ...base, ok: false, status: "paused", reasons: ["The agent is paused by a reviewer. Nothing was saved."], error: "The agent is paused. Nothing was saved." });
  }
  const inquiryId = typeof body.inquiry_id === "string" ? body.inquiry_id : "";
  if (!/^INQ-\d{4,}$/.test(inquiryId)) return refuse(400, "Unknown inquiry ID.");
  const input = (body.fields ?? {}) as Record<string, unknown>;

  const { data: submission, error } = await db
    .from("inquiry_submissions")
    .select("id, extraction_status")
    .eq("inquiry_id", inquiryId)
    .order("submission_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`submission not read: ${error.message}`);
  if (!submission) return refuse(404, "Unknown inquiry ID.");
  if (!["pending", "failed"].includes(submission.extraction_status)) {
    return refuse(409, "The details for this inquiry are already recorded.");
  }

  const raw: Record<string, { value: string; status: string; evidence: string }> = {};
  for (const name of REQUIRED_FIELDS) {
    const value = typeof input[name] === "string" ? (input[name] as string).trim().slice(0, 200) : "";
    raw[name] = { value, status: value ? "found" : "missing", evidence: value ? "Entered by employee" : "" };
  }
  if (raw.preferred_layout.value && !LAYOUTS.includes(raw.preferred_layout.value.toLowerCase())) {
    return refuse(400, "Choose one of the five layouts.");
  }
  // The typed values pass through the same personal-details check as pasted text.
  for (const field of Object.values(raw)) {
    if (!field.value) continue;
    const cleaned = clean(field.value);
    if (cleaned.refused || cleaned.held) return refuse(422, (cleaned.refused || cleaned.held)!);
    field.value = cleaned.result!.text;
  }

  const decision = checkEventDetails(raw, "");
  const nextStep = await saveDecision(
    inquiryId,
    submission.id,
    { extraction_method: "by_hand", extraction_status: "entered_by_hand", checked: checkedList(settings, null) },
    decision,
  );
  return answer(started, 200, { ...base, ok: true, status: decision.d1_result, reasons: d1Reasons(decision), inquiry_id: inquiryId, d1_result: decision.d1_result, next_step: nextStep });
}

/** The signed-in staff member's user id, or null. */
async function signedInStaff(req: Request): Promise<string | null> {
  const token = req.headers.get("x-user-token") ?? "";
  if (!token) return null;
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return null;
  const { data: staff } = await db.from("staff_members").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  return staff ? userData.user.id : null;
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    if (req.method === "GET") {
      const settings = await readSettings();
      const hasKey = (Deno.env.get("ANTHROPIC_API_KEY") ?? "") !== "";
      const ready = hasKey && !settings.paused;
      const message = settings.paused
        ? "The agent is paused by a reviewer."
        : hasKey
        ? "Ready. POST an inquiry with dry_run: true to test without saving."
        : "Not ready: add ANTHROPIC_API_KEY in Supabase → Edge Functions → Secrets.";
      return new Response(JSON.stringify({ ok: true, ready, message, statuses: STATUSES, test_models: TEST_MODELS, reads: ["inquiry"] }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (req.method !== "POST") {
      return answer(started, 405, { ok: false, status: "refused", reasons: ["Use GET or POST."], dry_run: false });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return answer(started, 400, { ok: false, status: "refused", reasons: ["The request was not valid JSON."], dry_run: false });
    }

    if (body.dry_run === true) return await handleDryRun(started, body);
    if (body.model !== undefined) {
      return answer(started, 400, { ok: false, status: "refused", reasons: ["A model can only be chosen in test mode (dry_run: true)."], dry_run: false });
    }

    const userId = await signedInStaff(req);
    if (!userId) {
      return answer(started, 401, { ok: false, status: "refused", reasons: ["Please sign in again."], dry_run: false, error: "Please sign in again." });
    }

    switch (body.action) {
      case "preview": {
        const cleaned = clean(body.text);
        if (cleaned.refused) return answer(started, 400, { ok: false, status: "refused", reasons: [cleaned.refused], dry_run: false, error: cleaned.refused });
        if (cleaned.held) return answer(started, 422, { ok: false, status: "held", reasons: [cleaned.held], dry_run: false, error: cleaned.held });
        const flags = findInstructionLikeText(cleaned.result!.text);
        return answer(started, 200, { ok: true, status: "preview", reasons: [], dry_run: false, ...cleaned.result, flags });
      }
      case "submit":
        return await handleSubmit(started, body, userId);
      case "manual":
        return await handleManual(started, body);
      default:
        return answer(started, 400, { ok: false, status: "refused", reasons: ["Unknown action."], dry_run: false, error: "Unknown action." });
    }
  } catch (error) {
    console.error("agent failed", error instanceof Error ? error.message : String(error));
    const message = "Something went wrong on our side. Nothing was sent to the client. Try again, or tell the event coordinator.";
    return answer(started, 500, { ok: false, status: "refused", reasons: [message], dry_run: false, error: message });
  }
});
