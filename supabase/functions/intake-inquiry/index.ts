// Edge Function: intake-inquiry
// Carries out T1 · Review supplied event details and the D1 decision.
//
// Actions (POST JSON body { action, ... }):
//   preview  { text }                                   -> removes personal details; saves nothing
//   submit   { text, confirmed: true, by_hand?: bool }  -> removes personal details again, calls Claude, saves, decides D1
//   manual   { inquiry_id, fields }                     -> saves the six details an employee typed in, decides D1
//
// The website sends the publishable key on the `apikey` header and the signed-in
// user's access token on `x-user-token`. Only staff with the employee role may call it.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { PersonalDetailsError, removePersonalDetails } from "./pii.js";
import { checkEventDetails, LAYOUTS, REQUIRED_FIELDS } from "./d1.js";
import { EXTRACTION_MODEL, extractEventDetails } from "./extract.ts";

const MAX_TEXT_LENGTH = 20_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type, x-client-info, x-user-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

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

async function alertCoordinator(inquiryId: string | null, problem: string) {
  const { error } = await db.from("coordinator_alerts").insert({ inquiry_id: inquiryId, task: "T1", problem });
  if (error) console.error("coordinator alert not saved", error.message);
}

/** Remove personal details, or explain why it could not be done. */
function clean(text: unknown) {
  if (typeof text !== "string" || text.trim() === "") {
    return { error: reply(400, { ok: false, error: "The inquiry is empty. Paste or upload the inquiry text." }) };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { error: reply(400, { ok: false, error: `The inquiry is too long (over ${MAX_TEXT_LENGTH} characters).` }) };
  }
  try {
    return { result: removePersonalDetails(text) };
  } catch (error) {
    const why = error instanceof PersonalDetailsError ? error.message : "The personal-details check failed.";
    return {
      error: reply(422, {
        ok: false,
        error: `${why} Nothing was saved or sent to the AI. Remove the personal details by hand and try again.`,
      }),
    };
  }
}

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

async function handleSubmit(body: Record<string, unknown>, userId: string) {
  if (body.confirmed !== true) {
    return reply(400, { ok: false, error: "Confirm that no client personal details remain before submitting." });
  }
  const cleaned = clean(body.text);
  if (cleaned.error) return cleaned.error;
  const { text, replaced } = cleaned.result!;
  const byHand = body.by_hand === true;

  const { data: started, error: startError } = await db.rpc("start_inquiry", {
    p_deidentified_text: text,
    p_placeholders_replaced: replaced,
    p_extraction_method: byHand ? "by_hand" : "claude",
    p_submitted_by: userId,
  });
  if (startError || !started?.length) throw new Error(`inquiry not created: ${startError?.message}`);
  const { inquiry_id: inquiryId, submission_id: submissionId } = started[0];

  if (byHand) {
    return reply(200, { ok: true, inquiry_id: inquiryId, next_step: "enter_details_by_hand" });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const dailyLimit = Number(Deno.env.get("AI_DAILY_RUN_LIMIT") ?? "100");
  const beforeCall = async () => {
    if (!apiKey || !Number.isFinite(dailyLimit)) return false;
    const { data, error } = await db.rpc("reserve_ai_call", {
      p_task: "T1 extract_event_details",
      p_inquiry_id: inquiryId,
      p_model: EXTRACTION_MODEL,
      p_daily_limit: dailyLimit,
    });
    if (error) throw new Error(`AI limit check failed: ${error.message}`);
    return data === true;
  };

  let extraction: Awaited<ReturnType<typeof extractEventDetails>>;
  try {
    extraction = apiKey
      ? await extractEventDetails(apiKey, text, beforeCall)
      : { ok: false, reason: "missing_key", attempts: 0, inputTokens: 0, outputTokens: 0 };
  } catch (error) {
    extraction = { ok: false, reason: error instanceof Error ? error.message : String(error), attempts: 0, inputTokens: 0, outputTokens: 0 };
  }
  console.log(
    JSON.stringify({ inquiry: inquiryId, extraction: extraction.ok ? "ok" : extraction.reason, attempts: extraction.attempts, input_tokens: extraction.inputTokens, output_tokens: extraction.outputTokens }),
  );

  if (!extraction.ok) {
    const message =
      extraction.reason === "daily_limit"
        ? "The daily AI limit has been reached. Enter the six details by hand."
        : extraction.reason === "missing_key"
        ? "The AI key is not set up yet. Enter the six details by hand."
        : `The AI could not read this inquiry (${extraction.reason}). Enter the six details by hand.`;
    await db
      .from("inquiry_submissions")
      .update({ extraction_status: "failed", extraction_error: extraction.reason, model: EXTRACTION_MODEL })
      .eq("id", submissionId);
    await db.from("inquiries").update({ next_step: "enter_details_by_hand" }).eq("id", inquiryId);
    await alertCoordinator(inquiryId, `Task 1 extraction failed: ${extraction.reason}`);
    return reply(200, { ok: true, inquiry_id: inquiryId, next_step: "enter_details_by_hand", notice: message });
  }

  const decision = checkEventDetails(extraction.fields, text);
  const nextStep = await saveDecision(inquiryId, submissionId, { extraction_status: "succeeded", model: EXTRACTION_MODEL }, decision);
  return reply(200, { ok: true, inquiry_id: inquiryId, d1_result: decision.d1_result, next_step: nextStep });
}

async function handleManual(body: Record<string, unknown>) {
  const inquiryId = typeof body.inquiry_id === "string" ? body.inquiry_id : "";
  if (!/^INQ-\d{4,}$/.test(inquiryId)) return reply(400, { ok: false, error: "Unknown inquiry ID." });
  const input = (body.fields ?? {}) as Record<string, unknown>;

  const { data: submission, error } = await db
    .from("inquiry_submissions")
    .select("id, extraction_status, deidentified_text")
    .eq("inquiry_id", inquiryId)
    .order("submission_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`submission not read: ${error.message}`);
  if (!submission) return reply(404, { ok: false, error: "Unknown inquiry ID." });
  if (!["pending", "failed"].includes(submission.extraction_status)) {
    return reply(409, { ok: false, error: "The details for this inquiry are already recorded." });
  }

  const raw: Record<string, { value: string; status: string; evidence: string }> = {};
  for (const name of REQUIRED_FIELDS) {
    const value = typeof input[name] === "string" ? (input[name] as string).trim().slice(0, 200) : "";
    raw[name] = { value, status: value ? "found" : "missing", evidence: value ? "Entered by employee" : "" };
  }
  if (raw.preferred_layout.value && !LAYOUTS.includes(raw.preferred_layout.value.toLowerCase())) {
    return reply(400, { ok: false, error: "Choose one of the five layouts." });
  }
  // The typed values pass through the same personal-details check as pasted text.
  for (const field of Object.values(raw)) {
    if (!field.value) continue;
    const cleaned = clean(field.value);
    if (cleaned.error) return cleaned.error;
    field.value = cleaned.result!.text;
  }

  const decision = checkEventDetails(raw, "");
  const nextStep = await saveDecision(
    inquiryId,
    submission.id,
    { extraction_method: "by_hand", extraction_status: "entered_by_hand" },
    decision,
  );
  return reply(200, { ok: true, inquiry_id: inquiryId, d1_result: decision.d1_result, next_step: nextStep });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return reply(405, { ok: false, error: "Use POST." });

  try {
    const token = req.headers.get("x-user-token") ?? "";
    if (!token) return reply(401, { ok: false, error: "Please sign in again." });
    const { data: userData, error: userError } = await db.auth.getUser(token);
    if (userError || !userData.user) return reply(401, { ok: false, error: "Please sign in again." });
    const userId = userData.user.id;

    const { data: staff } = await db.from("staff_members").select("role").eq("user_id", userId).maybeSingle();
    if (staff?.role !== "employee") {
      return reply(403, { ok: false, error: "Only employees can submit inquiries." });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return reply(400, { ok: false, error: "The request was not valid JSON." });
    }

    switch (body.action) {
      case "preview": {
        const cleaned = clean(body.text);
        if (cleaned.error) return cleaned.error;
        return reply(200, { ok: true, ...cleaned.result });
      }
      case "submit":
        return await handleSubmit(body, userId);
      case "manual":
        return await handleManual(body);
      default:
        return reply(400, { ok: false, error: "Unknown action." });
    }
  } catch (error) {
    console.error("intake-inquiry failed", error instanceof Error ? error.message : String(error));
    return reply(500, { ok: false, error: "Something went wrong on our side. Nothing was sent to the client. Try again, or tell the event coordinator." });
  }
});
