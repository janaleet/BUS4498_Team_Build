// Edge Function: agent
// Carries out T1 · Review supplied event details, D1 (Sufficient event details?),
// T3 · Identify event setup needs, D2 (Use template?), T2 · Prepare clarification
// request (drafts only; an employee approves and sends), T4 · Prepare template proposal
// and T5 · Prepare tailored proposal, then after each T6 review (D3 runs in the database)
// T7 · Revise proposal packet or a new T2 draft, and the lessons the agent learns.
//
// GET  -> status check; calls no AI and saves nothing.
// POST -> JSON body:
//   Test mode (no sign-in needed; saves nothing; counts toward the daily AI limits):
//     { "dry_run": true, "inquiry": "<inquiry text>", "model"?: "<a model in TEST_MODELS>" }
//   Website (signed-in staff only; the sign-in token goes on the x-user-token header):
//     { "action": "preview", "text" }                    removes personal details; saves nothing
//     { "action": "submit", "text", "confirmed": true, "by_hand"?: bool }
//     { "action": "manual", "inquiry_id", "fields" }     six details typed by an employee
//     { "action": "reply", "inquiry_id", "text", "confirmed": true }   the client's reply, same inquiry ID
//     { "action": "redraft", "request_id", "by_hand"?: bool }          new T2 draft after a rejection
//     { "action": "draft_proposal", "inquiry_id" }                     T4/T5 for an inquiry at that step
//     { "action": "rebuild_proposal", "proposal_id", "sections" }      employee's edited sections, rebuilt by code
//     { "action": "process_review", "review_id" }   after a T6 review: lesson, then T7 or T2 (D3 ran in the database)
//     { "action": "learn_rejection", "request_id" }  lesson from a rejected clarification draft
//   Test mode may also send "include_file": true to get the proposal .docx back as base64, and
//   "review": { "outcome": "needs_revision" | "needs_clarification", "comments" } to try T7 / T2
//   and the lesson on the drafted proposal (nothing is saved).
// Every answer has ok, status (one word), reasons, dry_run, ms, and usage.
// Final statuses: template (-> T4), tailored (-> T5), clarify (-> T2), held (a person decides),
// paused, refused.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { PersonalDetailsError, removePersonalDetails } from "./pii.js";
import { checkEventDetails, LAYOUTS, REQUIRED_FIELDS } from "./d1.js";
import { EXTRACTION_MODEL, extractEventDetails } from "./extract.ts";
import { FLAG_MODEL, flagSetupQuestions } from "./flag.ts";
import { assessSetup, setupReasons } from "./setup.js";
import { findInstructionLikeText } from "./flags.js";
import { DRAFT_MODEL, draftClarification } from "./draft.ts";
import {
  addBusinessDays, assembleDraft, buildIssues, checkDraft, checklistWording, DEADLINE_BUSINESS_DAYS, eventSummary,
  mergeReplyFields, REMINDER_BUSINESS_DAY, todayInVenue,
} from "./clarify.js";
import JSZip from "npm:jszip@3.10.1";
import { TEMPLATE_DOCX_BASE64 } from "./template_docx.ts";
import {
  applyTailoring, buildTemplateValues, byHandTailoring, checkTailoring, EDITABLE, fillDocumentXml, markMissing,
} from "./proposal.js";
import { TAILOR_MODEL, tailorProposal } from "./tailor.ts";
import { REVISE_MODEL, reviseProposal } from "./revise.ts";
import { issuesFromConflicts, issuesFromReview, lessonsApplied, lessonsBlock } from "./revise.js";
import { LESSON_MODEL, MAX_LESSONS, writeLesson } from "./lessons.ts";
import { normalizeEventType } from "./setup.js";

const MAX_TEXT_LENGTH = 20_000;
// Models test mode may compare. Add the models runtime/test-plan.md lists under
// "Models to compare" once the test plan is written.
const TEST_MODELS = [EXTRACTION_MODEL];
const STATUSES = ["template", "tailored", "clarify", "held", "paused", "refused"];
const NEXT_STEP: Record<string, string> = {
  template: "t4_template_proposal",
  tailored: "t5_tailored_proposal",
  clarify: "t2_clarification",
  held: "held_setup_shortage",
  review: "t6_review",
  revision: "t7_revision",
  handoff: "t6_handoff",
};
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
    holidays: Array.isArray(map.holidays) ? (map.holidays as string[]) : [],
  };
}

async function alertCoordinator(inquiryId: string | null, task: string, problem: string) {
  const { error } = await db.from("coordinator_alerts").insert({ inquiry_id: inquiryId, task, problem });
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

/** Plain-language reasons for a D1 result of "missing". */
function d1MissingReasons(decision: ReturnType<typeof checkEventDetails>): string[] {
  return [
    ...decision.missing_fields.map((name: string) => {
      const field = decision.fields[name] ?? {};
      const label = name.replace(/_/g, " ");
      return field.status === "conflicting"
        ? `The ${label} is conflicting${field.value ? ` ("${field.value}")` : ""}; the client must give one value.`
        : `The ${label} is missing.`;
    }),
    "Next: Task 2, a clarification request to the client.",
  ];
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

/** Reserve each AI call against the daily limits, and record its tokens. */
function aiHooks(task: string, inquiryId: string | null, dryRun: boolean, model: string, usage: Usage) {
  let usageId: number | null = null;
  const beforeCall = async () => {
    const { data, error } = await db.rpc("reserve_ai_call", { p_task: task, p_inquiry_id: inquiryId, p_model: model, p_dry_run: dryRun });
    if (error) throw new Error(`AI limit check failed: ${error.message}`);
    usageId = data ?? null;
    return usageId !== null;
  };
  const afterCall = async (inputTokens: number, outputTokens: number) => {
    usage.model = model;
    usage.input_tokens += inputTokens;
    usage.output_tokens += outputTokens;
    if (usageId !== null) {
      const { error } = await db.from("ai_usage").update({ input_tokens: inputTokens, output_tokens: outputTokens }).eq("id", usageId);
      if (error) console.error("token count not saved", error.message);
    }
  };
  return { beforeCall, afterCall };
}

/** T1 extract_event_details with the daily limits and token counting. */
async function runExtraction(text: string, inquiryId: string | null, dryRun: boolean, model: string, usage: Usage) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  usage.model = model;
  if (!apiKey) return { ok: false as const, reason: "missing_key", attempts: 0, inputTokens: 0, outputTokens: 0 };
  const { beforeCall, afterCall } = aiHooks("T1 extract_event_details", inquiryId, dryRun, model, usage);
  let extraction: Awaited<ReturnType<typeof extractEventDetails>>;
  try {
    extraction = await extractEventDetails(apiKey, text, beforeCall, afterCall, model);
  } catch (error) {
    extraction = { ok: false, reason: error instanceof Error ? error.message : String(error), attempts: 0, inputTokens: 0, outputTokens: 0 };
  }
  console.log(JSON.stringify({ inquiry: inquiryId, dry_run: dryRun, extraction: extraction.ok ? "ok" : extraction.reason, attempts: extraction.attempts }));
  return extraction;
}

function extractionHeldReason(reason: string) {
  if (reason === "ai_limit") return "The daily AI limit is reached or the agent is paused, so the AI was not called. Enter the six details by hand.";
  if (reason === "missing_key") return "The AI key is not set up yet (Supabase → Edge Functions → Secrets → ANTHROPIC_API_KEY). Enter the six details by hand.";
  return `The AI could not read this inquiry (${reason}). Enter the six details by hand.`;
}

type Lesson = { id: number; lesson: string };

/**
 * The relevant lessons (memory rule 6): active, this topic, for every event or this event
 * type, newest first, at most 10. Checked as still switched on when read (memory rule 12).
 */
async function loadLessons(topic: string, eventType: string): Promise<Lesson[]> {
  const { data, error } = await db.from("lessons").select("id, lesson, event_type, active")
    .eq("active", true).eq("topic", topic).order("created_at", { ascending: false }).limit(50);
  if (error) {
    console.error("lessons not read", error.message);
    return [];
  }
  return (data ?? [])
    .filter((l) => l.active && (!l.event_type || l.event_type === eventType))
    .slice(0, MAX_LESSONS)
    .map((l) => ({ id: l.id, lesson: l.lesson }));
}

/**
 * Learn one lesson from a trusted outcome with a typed reason. One lesson per outcome
 * (the database refuses a second). Returns the lesson text, or why none was saved.
 */
async function learnLesson(opts: {
  learnedFrom: string;
  outcome: "needs_revision" | "needs_clarification" | "rejected";
  topic: "clarification request" | "proposal";
  reason: string;
  inquiryId: string;
  eventType: string;
  dryRun: boolean;
  usage: Usage;
}): Promise<{ lesson?: string; problem?: string }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!apiKey) return { problem: "the AI key is not set up" };
  if (!opts.dryRun) {
    const { data: existing } = await db.from("lessons").select("id").eq("learned_from", opts.learnedFrom).eq("outcome", opts.outcome).maybeSingle();
    if (existing) return { problem: "a lesson from this outcome already exists" };
  }
  const { beforeCall, afterCall } = aiHooks("Lesson learn_lesson", opts.dryRun ? null : opts.inquiryId, opts.dryRun, LESSON_MODEL, opts.usage);
  const written = await writeLesson(apiKey, { topic: opts.topic, outcome: opts.outcome, reason: opts.reason, eventType: opts.eventType }, beforeCall, afterCall);
  if (!written.ok) return { problem: written.reason };
  if (!opts.dryRun) {
    const { error } = await db.from("lessons").insert({
      lesson: written.lesson, topic: opts.topic, event_type: written.specific && opts.eventType ? opts.eventType : null,
      learned_from: opts.learnedFrom, outcome: opts.outcome, inquiry_id: opts.inquiryId, reason: opts.reason.slice(0, 2000), model: LESSON_MODEL,
    });
    if (error) return { problem: `not saved (${error.message})` };
  }
  return { lesson: written.lesson };
}

/**
 * T3 + D2: read the active rooms, let the AI sort the client's AV and special requests,
 * then decide room, tables, chairs, AV and the route in code. Saves the assessment
 * unless dryRun. Returns { assessment, reasons, checked } or { held } when rooms can't be read.
 */
async function runSetup(
  fields: Record<string, { value: string; status: string }>,
  inquiryId: string | null,
  submissionId: number | null,
  dryRun: boolean,
  model: string,
  usage: Usage,
) {
  const { data: rooms, error } = await db.from("rooms").select("*").eq("active", true);
  if (error || !rooms || rooms.length === 0) {
    const reason = "The room list could not be read, so setup needs were not worked out. The event coordinator was told.";
    if (!dryRun) {
      await alertCoordinator(inquiryId, "T3", `Room list unreadable: ${error?.message ?? "no active rooms"}`);
      if (inquiryId) await db.from("inquiries").update({ next_step: NEXT_STEP.held }).eq("id", inquiryId);
    }
    return { held: reason };
  }

  const text = (name: string) => (fields[name]?.status === "found" ? String(fields[name].value) : "");
  const hasRequests = Boolean(text("av_requests") || text("special_requests") || text("catering"));
  const empty = { ok: true as const, av_items: [], special_requests: [], venue_catering_requested: false, questions: [], attempts: 0 };
  let requests: Awaited<ReturnType<typeof flagSetupQuestions>> = empty;
  let flagFailure = "";
  if (hasRequests) {
    const draft = assessSetup(fields, rooms, empty);
    const setupList = [
      draft.room ? `Room: ${draft.room} (${draft.layout} ${draft.room_capacity})` : "Room: none fits",
      ...draft.tables.map((t: { item: string; qty: number }) => `${t.qty} × ${t.item}`),
      draft.chairs ? `${draft.chairs.qty} chairs` : "",
      ...draft.av.filter((a: { status: string }) => a.status === "needed").map((a: { item: string; qty: number }) => `${a.qty} × ${a.item}`),
    ].filter(Boolean).join("; ");
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    if (!apiKey) {
      requests = { ok: false, reason: "missing_key", attempts: 0 };
    } else {
      const { beforeCall, afterCall } = aiHooks("T3 flag_setup_questions", inquiryId, dryRun, model, usage);
      try {
        requests = await flagSetupQuestions(apiKey, {
          av_requests: text("av_requests"),
          special_requests: text("special_requests"),
          // The client's own sentence too, so the AI can tell who provides the food.
          catering: text("catering") && (fields.catering as { evidence?: string })?.evidence
            ? `${text("catering")} (client's words: "${(fields.catering as { evidence?: string }).evidence}")`
            : text("catering"),
          event_type: text("event_type"),
          setup_list: setupList,
        }, beforeCall, afterCall, model);
      } catch (e) {
        requests = { ok: false, reason: e instanceof Error ? e.message : String(e), attempts: 0 };
      }
    }
    if (!requests.ok) flagFailure = requests.reason;
  }

  const assessment = assessSetup(fields, rooms, requests.ok ? requests : null);
  const reasons = setupReasons(assessment);
  const checked = [
    `Rooms: ${rooms.length} active room(s)${rooms.some((r: { is_example: boolean }) => r.is_example) ? " (example venue data)" : ""}`,
    "Rules: room choice, tables, chairs, AV, template list (setup-and-routing-rules.md, sections 4–5)",
    hasRequests
      ? (requests.ok ? `AI model for special requests: ${model}` : `Special requests not checked (${flagFailure})`)
      : "No AV or special requests to check, so the AI was not called",
  ];
  console.log(JSON.stringify({ inquiry: inquiryId, dry_run: dryRun, route: assessment.route, flag: hasRequests ? (requests.ok ? "ok" : flagFailure) : "skipped" }));

  let assessmentId: number | null = null;
  if (!dryRun && inquiryId && submissionId) {
    const { data: saved, error: saveError } = await db.from("setup_assessments").insert({
      inquiry_id: inquiryId,
      submission_id: submissionId,
      event_type: assessment.event_type,
      guest_count: assessment.guest_count,
      layout: assessment.layout,
      room: assessment.room,
      room_capacity: assessment.room_capacity,
      tables: assessment.tables,
      chairs: assessment.chairs,
      av: assessment.av,
      setup_teardown: assessment.setup_teardown,
      unresolved: assessment.unresolved,
      assumptions: assessment.assumptions,
      shortages: assessment.shortages,
      questions: assessment.questions,
      on_template_list: assessment.on_template_list,
      fits_standard_layout: assessment.fits_standard_layout,
      special_requests: assessment.special_requests,
      special_requests_checked: assessment.special_requests_checked,
      route: assessment.route,
      model: hasRequests && requests.ok ? model : null,
      checked,
    }).select("id").single();
    if (saveError) throw new Error(`setup assessment not saved: ${saveError.message}`);
    assessmentId = saved.id;
    const { error: stepError } = await db.from("inquiries").update({ next_step: NEXT_STEP[assessment.route] }).eq("id", inquiryId);
    if (stepError) throw new Error(`inquiry not updated: ${stepError.message}`);
    if (assessment.route === "held") await alertCoordinator(inquiryId, "T3", `Setup held: ${assessment.shortages.join(" ")}`);
    if (flagFailure) await alertCoordinator(inquiryId, "T3", `Special requests not checked (${flagFailure}); review in T6.`);
  }
  return { assessment, reasons, checked, assessmentId };
}

/** Build the .docx from the template with every placeholder filled. */
async function buildDocx(values: Record<string, unknown>): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(Uint8Array.from(atob(TEMPLATE_DOCX_BASE64), (c) => c.charCodeAt(0)));
  const xml = await zip.file("word/document.xml")!.async("string");
  zip.file("word/document.xml", fillDocumentXml(xml, values));
  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * T4 (template, code only) or T5 (tailored: the AI writes the tailored sections, code places
 * them). A failed template fill goes to T5, as the T4 spec says; a failed AI draft is built
 * with "[TO CONFIRM – write by hand]" in the tailored sections and the coordinator is told.
 * An employee's edited sections (editedSections) are placed by code with no AI.
 * Unless dryRun, the .docx is stored and a new proposal version saved as the current draft.
 */
async function runProposal(opts: {
  inquiryId: string | null;
  submissionId: number | null;
  assessmentId: number | null;
  fields: Record<string, { value: string; status: string }>;
  assessment: Record<string, any>; // deno-lint-ignore no-explicit-any
  sourceText: string;
  dryRun: boolean;
  model: string;
  usage: Usage;
  editedSections?: Record<string, unknown>;
  baseVersion?: Record<string, any>; // deno-lint-ignore no-explicit-any
  editorId?: string;
  includeFile?: boolean;
  revision?: { model: string; lessonsApplied: string[] };
}) {
  const id = opts.inquiryId ?? "INQ-TEST";
  let lessonsUsed: string[] = opts.revision?.lessonsApplied ?? [];
  const { data: room } = opts.assessment.room
    ? await db.from("rooms").select("name, notes").eq("name", opts.assessment.room).maybeSingle()
    : { data: null };
  const problems: string[] = [];
  let kind: "template" | "tailored" = opts.assessment.route === "tailored" ? "tailored" : "template";
  let draftedBy = "code";
  let modelUsed: string | null = null;
  let deviations: { section: string; change: string; d2_reason: string }[] = [];
  let values: Record<string, any> = buildTemplateValues(id, opts.fields, opts.assessment, room, todayInVenue()); // deno-lint-ignore no-explicit-any

  if (opts.editedSections && opts.baseVersion) {
    // Employee's edit or a T7 revision: start from the current sections, replace only the editable ones.
    values = { ...opts.baseVersion.sections };
    for (const key of EDITABLE) {
      const v = opts.editedSections[key];
      if (typeof v === "string") values[key] = key === "room_notes" ? v.trim() : v.split("\n").map((s) => s.trim()).filter(Boolean);
      else if (Array.isArray(v)) values[key] = v.map((s) => String(s).trim()).filter((s) => s && s !== "None");
    }
    values = markMissing(values);
    kind = opts.baseVersion.kind;
    deviations = opts.baseVersion.deviations ?? [];
    draftedBy = opts.revision ? "revision" : "employee_edit";
    if (opts.revision) modelUsed = opts.revision.model;
  } else if (kind === "template") {
    try {
      await buildDocx(values); // a fill error sends the inquiry to T5
    } catch (e) {
      problems.push(`The template could not be filled (${e instanceof Error ? e.message : String(e)}), so this is a tailored proposal (T5).`);
      kind = "tailored";
    }
  }

  if (kind === "tailored" && !opts.editedSections) {
    const d2Reasons = [
      ...(opts.assessment.on_template_list ? [] : [`Event type not on the template list (${opts.assessment.event_type})`]),
      ...(opts.assessment.fits_standard_layout ? [] : ["Guest count outside a standard layout"]),
      ...((opts.assessment.special_requests ?? []).map((s: string) => `Special request: ${s}`)),
    ];
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    let result: Awaited<ReturnType<typeof tailorProposal>> = { ok: false, reason: "the AI key is not set up", attempts: 0 };
    const lessons = await loadLessons("proposal", String(opts.assessment.event_type ?? ""));
    lessonsUsed = lessonsApplied(lessons);
    if (apiKey) {
      const { beforeCall, afterCall } = aiHooks("T5 prepare_tailored_proposal", opts.inquiryId, opts.dryRun, opts.model, opts.usage);
      try {
        result = await tailorProposal(apiKey, { inquiry_text: opts.sourceText, assessment: opts.assessment, d2_reasons: d2Reasons, lessons: lessonsBlock(lessons) }, beforeCall, afterCall, opts.model);
      } catch (e) {
        result = { ok: false, reason: e instanceof Error ? e.message : String(e), attempts: 0 };
      }
    }
    const check = result.ok ? checkTailoring(result.tailoring, `${opts.sourceText}\n${JSON.stringify(opts.assessment)}\n${JSON.stringify(values)}`) : null;
    if (result.ok && check!.ok) {
      values = applyTailoring(values, result.tailoring);
      deviations = result.tailoring.deviations ?? [];
      draftedBy = "ai";
      modelUsed = opts.model;
    } else {
      const why = result.ok ? `the AI's text failed the check (${check!.problems.join(" ")})` : `the AI could not tailor (${result.reason})`;
      problems.push(`Tailored sections must be written by hand: ${why}.`);
      values = byHandTailoring(values, opts.assessment.special_requests ?? []);
      deviations = d2Reasons.map((r) => ({ section: "Setup and Equipment", change: "Write by hand", d2_reason: r }));
      draftedBy = "by_hand";
    }
  }

  const bytes = await buildDocx(values);
  const unresolved = (values.unresolved_items as string[]).filter((x) => x !== "None");
  let proposalId: number | null = null;
  let version = 0;
  if (!opts.dryRun && opts.inquiryId && opts.submissionId && opts.assessmentId) {
    const { data: last } = await db.from("proposals").select("version").eq("inquiry_id", opts.inquiryId).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: inq } = await db.from("inquiries").select("revision_round").eq("id", opts.inquiryId).single();
    const round = Math.min(Number(inq?.revision_round ?? 0), 2);
    version = (last?.version ?? 0) + 1;
    const path = `${opts.inquiryId}/v${version}.docx`;
    const { error: upError } = await db.storage.from("proposals").upload(path, bytes, { contentType: DOCX_TYPE, upsert: false });
    if (upError) throw new Error(`proposal file not saved: ${upError.message}`);
    await db.from("proposals").update({ status: "superseded" }).eq("inquiry_id", opts.inquiryId).eq("status", "draft");
    const { data: saved, error } = await db.from("proposals").insert({
      inquiry_id: opts.inquiryId, submission_id: opts.submissionId, assessment_id: opts.assessmentId, version, kind,
      sections: values, deviations, unresolved, drafted_by: draftedBy, model: modelUsed, problems,
      file_path: path, file_bytes: bytes.length, edited_by: opts.editorId ?? null,
      revision_round: round, lessons_applied: lessonsUsed,
    }).select("id").single();
    if (error) throw new Error(`proposal not saved: ${error.message}`);
    proposalId = saved.id;
    await db.from("inquiries").update({ next_step: NEXT_STEP.review }).eq("id", opts.inquiryId);
    if (draftedBy === "by_hand") await alertCoordinator(opts.inquiryId, kind === "tailored" ? "T5" : "T4", problems.join(" "));
  }
  console.log(JSON.stringify({ inquiry: opts.inquiryId, dry_run: opts.dryRun, proposal: kind, drafted_by: draftedBy, bytes: bytes.length }));
  return {
    proposal_id: proposalId, version, kind, drafted_by: draftedBy, model: modelUsed, sections: values, deviations, unresolved, problems,
    lessons_applied: lessonsUsed,
    file_bytes: bytes.length, docx_base64: opts.includeFile ? toBase64(bytes) : undefined,
  };
}

/**
 * T2: draft a clarification request for the issues, check it, and (unless dryRun) save it
 * as a draft that waits for an employee's approval. The AI words the questions; code adds
 * the inquiry ID, numbering, reply-by date and reply line, and checks the result. If the
 * AI can't draft, or its draft fails the check, the draft is written from the checklist.
 */
async function runClarification(opts: {
  issues: Record<string, unknown>[];
  fields: Record<string, { value: string; status: string }>;
  sourceText: string;
  inquiryId: string | null;
  submissionId: number | null;
  dryRun: boolean;
  model: string;
  usage: Usage;
  holidays: string[];
  rejectionReason?: string;
  redraftOf?: number;
  byHand?: boolean;
}) {
  const id = opts.inquiryId ?? "INQ-TEST";
  const today = todayInVenue();
  const deadline = addBusinessDays(today, DEADLINE_BUSINESS_DAYS, opts.holidays);
  const reminderDue = addBusinessDays(today, REMINDER_BUSINESS_DAY, opts.holidays);
  const problems: string[] = [];
  let draftedBy = "checklist";
  let draft = assembleDraft(id, deadline, checklistWording(opts.issues));
  const eventType = opts.fields.event_type?.status === "found" ? normalizeEventType(opts.fields.event_type.value) : "";
  const lessons = await loadLessons("clarification request", eventType);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (opts.byHand) {
    problems.push("Written from the checklist at the employee's request.");
  } else if (!apiKey) {
    problems.push("The AI key is not set up, so this draft was written from the checklist.");
  } else {
    const { beforeCall, afterCall } = aiHooks("T2 draft_clarification_request", opts.inquiryId, opts.dryRun, opts.model, opts.usage);
    let result: Awaited<ReturnType<typeof draftClarification>>;
    try {
      result = await draftClarification(apiKey, {
        event_summary: eventSummary(opts.fields),
        client_asked: /\b(price|pricing|cost|how much|rate|available|availability)\b/i.test(opts.sourceText) ? "the client asked about price or availability" : "",
        issues: opts.issues.map((i) => ({ label: i.label, status: i.status, client_said: i.known, evidence: i.evidence, usable_answer: i.usable_answer })),
        inquiry_text: opts.sourceText,
        rejection_reason: opts.rejectionReason,
        lessons: lessonsBlock(lessons),
      }, beforeCall, afterCall, opts.model);
    } catch (e) {
      result = { ok: false, reason: e instanceof Error ? e.message : String(e), attempts: 0 };
    }
    if (result.ok) {
      const aiDraft = assembleDraft(id, deadline, result.wording);
      const check = checkDraft(aiDraft, id, deadline, opts.issues.length);
      if (check.ok) {
        draft = aiDraft;
        draftedBy = "ai";
      } else {
        problems.push(`The AI draft failed the check (${check.problems.join(" ")}), so this draft was written from the checklist.`);
      }
    } else {
      problems.push(`The AI could not draft (${result.reason}), so this draft was written from the checklist.`);
    }
  }
  const check = checkDraft(draft, id, deadline, opts.issues.length);

  let requestId: number | null = null;
  if (!opts.dryRun && opts.inquiryId && opts.submissionId) {
    const { data, error } = await db.from("clarification_requests").insert({
      inquiry_id: opts.inquiryId,
      submission_id: opts.submissionId,
      kind: "request",
      subject: draft.subject,
      body: draft.body,
      issues: opts.issues,
      questions: draft.questions,
      deadline,
      reminder_due: reminderDue,
      drafted_by: draftedBy,
      model: draftedBy === "ai" ? opts.model : null,
      draft_problems: problems,
      redraft_of: opts.redraftOf ?? null,
      lessons_applied: draftedBy === "ai" ? lessonsApplied(lessons) : [],
    }).select("id").single();
    if (error) throw new Error(`clarification draft not saved: ${error.message}`);
    requestId = data.id;
    await db.from("inquiries").update({ next_step: "t2_clarification" }).eq("id", opts.inquiryId);
    if (draftedBy !== "ai" && !opts.byHand) await alertCoordinator(opts.inquiryId, "T2", problems.join(" "));
  }
  return {
    request_id: requestId,
    subject: draft.subject,
    body: draft.body,
    deadline,
    reminder_due: reminderDue,
    drafted_by: draftedBy,
    problems,
    check,
    issues: opts.issues,
    lessons_applied: draftedBy === "ai" ? lessonsApplied(lessons) : [],
  };
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
  const usage = noUsage();
  const checked = checkedList(settings, model, replaced);

  const extraction = await runExtraction(text, null, true, model, usage);
  if (!extraction.ok) {
    return answer(started, 200, { ...base, ok: true, status: "held", reasons: [extractionHeldReason(extraction.reason), ...flagReasons], usage, flags, checked });
  }
  const decision = checkEventDetails(extraction.fields, text);
  if (decision.d1_result === "missing") {
    const clarification = await runClarification({
      issues: buildIssues(decision, null), fields: decision.fields, sourceText: text, inquiryId: null, submissionId: null,
      dryRun: true, model, usage, holidays: settings.holidays,
    });
    return answer(started, 200, { ...base, ok: true, status: "clarify", reasons: [...d1MissingReasons(decision), ...flagReasons], usage, d1_result: "missing", fields: decision.fields, missing_fields: decision.missing_fields, clarification, flags, checked });
  }
  const setup = await runSetup(decision.fields, null, null, true, model, usage);
  if ("held" in setup) {
    return answer(started, 200, { ...base, ok: true, status: "held", reasons: [setup.held, ...flagReasons], usage, d1_result: "sufficient", fields: decision.fields, flags, checked });
  }
  const clarification = setup.assessment.route === "clarify"
    ? await runClarification({
      issues: buildIssues(decision, setup.assessment), fields: decision.fields, sourceText: text, inquiryId: null, submissionId: null,
      dryRun: true, model, usage, holidays: settings.holidays,
    })
    : undefined;
  const proposal = ["template", "tailored"].includes(setup.assessment.route)
    ? await runProposal({
      inquiryId: null, submissionId: null, assessmentId: null, fields: decision.fields, assessment: setup.assessment,
      sourceText: text, dryRun: true, model: TAILOR_MODEL, usage, includeFile: body.include_file === true,
    })
    : undefined;

  // Test mode for T6 → D3 → T7 / T2 and the lesson, on the proposal just drafted (nothing saved).
  let review: Record<string, unknown> | undefined;
  const asked = body.review as { outcome?: string; comments?: string } | undefined;
  if (proposal && asked && ["needs_revision", "needs_clarification"].includes(String(asked.outcome)) && String(asked.comments ?? "").trim().length >= 3) {
    const comments = String(asked.comments).slice(0, 4000);
    const lesson = await learnLesson({
      learnedFrom: "proposal_review:0", outcome: asked.outcome as "needs_revision", topic: "proposal", reason: comments,
      inquiryId: "INQ-TEST", eventType: String(setup.assessment.event_type ?? ""), dryRun: true, usage,
    });
    if (asked.outcome === "needs_clarification") {
      const draft = await runClarification({
        issues: issuesFromReview(comments), fields: decision.fields, sourceText: text, inquiryId: null, submissionId: null,
        dryRun: true, model, usage, holidays: settings.holidays,
      });
      review = { route: "t2", lesson, clarification: draft };
    } else {
      const { lessons, result } = await runRevision({
        inquiryId: null, review: { outcome: "needs_revision", comments, checklist: {} }, sections: proposal.sections,
        fields: decision.fields, assessment: setup.assessment, inquiryText: text, dryRun: true, usage,
      });
      const clarify = result.status === "blocked"
        ? await runClarification({
          issues: issuesFromConflicts(result.conflicts), fields: decision.fields, sourceText: text, inquiryId: null, submissionId: null,
          dryRun: true, model, usage, holidays: settings.holidays,
        })
        : undefined;
      review = { route: "t7", lesson, revision: { ...result, lessons_applied: lessonsApplied(lessons) }, clarification: clarify };
    }
  }
  return answer(started, 200, {
    review,
    clarification,
    proposal,
    ...base,
    ok: true,
    status: setup.assessment.route,
    reasons: [...setup.reasons, ...flagReasons],
    usage,
    d1_result: "sufficient",
    fields: decision.fields,
    missing_fields: decision.missing_fields,
    setup: setup.assessment,
    flags,
    checked: [...checked, ...setup.checked],
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
}

/**
 * After D1 is saved: run T3 + D2 when the details are sufficient, and T2 (a draft for an
 * employee to approve) when the client must be asked. Returns status, reasons, next step.
 */
async function afterD1(
  inquiryId: string,
  submissionId: number,
  decision: ReturnType<typeof checkEventDetails>,
  usage: Usage,
  sourceText: string,
  holidays: string[],
) {
  const clarify = (issues: Record<string, unknown>[]) => runClarification({
    issues, fields: decision.fields, sourceText, inquiryId, submissionId, dryRun: false, model: DRAFT_MODEL, usage, holidays,
  });
  if (decision.d1_result === "missing") {
    const draft = await clarify(buildIssues(decision, null));
    return { status: "clarify", reasons: [...d1MissingReasons(decision), "A clarification request is drafted and waits for an employee's approval."], next_step: NEXT_STEP.clarify, request_id: draft.request_id };
  }
  const setup = await runSetup(decision.fields, inquiryId, submissionId, false, FLAG_MODEL, usage);
  if ("held" in setup) return { status: "held", reasons: [setup.held], next_step: NEXT_STEP.held };
  if (setup.assessment.route === "clarify") {
    const draft = await clarify(buildIssues(decision, setup.assessment));
    return { status: "clarify", reasons: [...setup.reasons, "A clarification request is drafted and waits for an employee's approval."], next_step: NEXT_STEP.clarify, request_id: draft.request_id };
  }
  if (setup.assessment.route === "held") {
    return { status: "held", reasons: setup.reasons, next_step: NEXT_STEP.held };
  }
  const proposal = await runProposal({
    inquiryId, submissionId, assessmentId: setup.assessmentId, fields: decision.fields, assessment: setup.assessment,
    sourceText, dryRun: false, model: TAILOR_MODEL, usage,
  });
  return {
    status: proposal.kind,
    reasons: [...setup.reasons, `Proposal version ${proposal.version} drafted (${proposal.kind}) and waits for review.`, ...proposal.problems],
    next_step: NEXT_STEP.review,
  };
}

/** T4/T5 for an inquiry already waiting at that step (or to try again): uses its latest assessment. */
async function handleDraftProposal(started: number, body: Record<string, unknown>) {
  const base = { dry_run: false };
  const refuse = (httpStatus: number, message: string, status = "refused") =>
    answer(started, httpStatus, { ...base, ok: false, status, reasons: [message], error: message });
  const inquiryId = typeof body.inquiry_id === "string" ? body.inquiry_id : "";
  if (!/^INQ-\d{4,}$/.test(inquiryId)) return refuse(400, "Unknown inquiry ID.");
  const settings = await readSettings();
  if (settings.paused) return refuse(200, "The agent is paused. Nothing was saved.", "paused");
  const { data: a, error } = await db.from("setup_assessments").select("*").eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`assessment not read: ${error.message}`);
  if (!a || !["template", "tailored"].includes(a.route)) return refuse(409, "This inquiry has no setup assessment that leads to a proposal.");
  const { data: sub } = await db.from("inquiry_submissions").select("id, fields, deidentified_text").eq("id", a.submission_id).single();
  const { data: subs } = await db.from("inquiry_submissions").select("deidentified_text").eq("inquiry_id", inquiryId).order("submission_number");
  const usage = noUsage();
  const proposal = await runProposal({
    inquiryId, submissionId: a.submission_id, assessmentId: a.id, fields: sub?.fields ?? {}, assessment: a,
    sourceText: (subs ?? []).map((s) => s.deidentified_text).join("\n\n"), dryRun: false, model: TAILOR_MODEL, usage,
  });
  return answer(started, 200, {
    ...base, ok: true, status: proposal.kind,
    reasons: [`Proposal version ${proposal.version} drafted (${proposal.kind}) and waits for review.`, ...proposal.problems],
    usage, inquiry_id: inquiryId, proposal_id: proposal.proposal_id, next_step: NEXT_STEP.review,
  });
}

/** An employee's edited sections: code rebuilds the .docx as a new version (no AI, no upload). */
async function handleRebuildProposal(started: number, body: Record<string, unknown>, userId: string) {
  const base = { dry_run: false };
  const refuse = (httpStatus: number, message: string, status = "refused") =>
    answer(started, httpStatus, { ...base, ok: false, status, reasons: [message], error: message });
  const proposalId = Number(body.proposal_id);
  if (!Number.isInteger(proposalId)) return refuse(400, "Unknown proposal.");
  const sections = (body.sections ?? {}) as Record<string, unknown>;
  const settings = await readSettings();
  if (settings.paused) return refuse(200, "The agent is paused. Nothing was saved.", "paused");
  for (const key of EDITABLE) {
    const v = sections[key];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.length > 4000) return refuse(400, "Each section must be text of 4,000 characters or fewer.");
    try {
      const cleaned = removePersonalDetails(v);
      if (cleaned.replaced.EMAIL || cleaned.replaced.PHONE || cleaned.replaced.ADDRESS) {
        return refuse(422, "A section contains an email address, phone number or street address. Remove it and try again.");
      }
    } catch {
      return refuse(422, "A section contains contact details that could not be checked. Remove them and try again.");
    }
  }
  const { data: current, error } = await db.from("proposals").select("*").eq("id", proposalId).maybeSingle();
  if (error) throw new Error(`proposal not read: ${error.message}`);
  if (!current || current.status !== "draft") return refuse(409, "Only the current draft can be edited.");
  const { data: a } = await db.from("setup_assessments").select("*").eq("id", current.assessment_id).single();
  const { data: sub } = await db.from("inquiry_submissions").select("fields").eq("id", current.submission_id).single();
  const usage = noUsage();
  const proposal = await runProposal({
    inquiryId: current.inquiry_id, submissionId: current.submission_id, assessmentId: current.assessment_id,
    fields: sub?.fields ?? {}, assessment: a, sourceText: "", dryRun: false, model: TAILOR_MODEL, usage,
    editedSections: sections, baseVersion: current, editorId: userId,
  });
  return answer(started, 200, {
    ...base, ok: true, status: proposal.kind,
    reasons: [`Version ${proposal.version} saved with your edits. The earlier version is kept.`],
    usage, inquiry_id: current.inquiry_id, proposal_id: proposal.proposal_id,
  });
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
  if (flags.length) await alertCoordinator(inquiryId, "T1", `Inquiry text tried to instruct the agent: ${flags.join(" / ")}`);

  if (byHand) {
    await db.from("inquiry_submissions").update({ checked: checkedList(settings, null, replaced) }).eq("id", submissionId);
    return answer(started, 200, { ...base, ok: true, status: "held", reasons: ["The employee chose to enter the six details by hand.", ...flagReasons], inquiry_id: inquiryId, next_step: "enter_details_by_hand" });
  }

  const usage = noUsage();
  const extraction = await runExtraction(text, inquiryId, false, EXTRACTION_MODEL, usage);
  const checked = checkedList(settings, EXTRACTION_MODEL, replaced);
  if (!extraction.ok) {
    const reason = extractionHeldReason(extraction.reason);
    await db
      .from("inquiry_submissions")
      .update({ extraction_status: "failed", extraction_error: extraction.reason, model: EXTRACTION_MODEL, checked })
      .eq("id", submissionId);
    await db.from("inquiries").update({ next_step: "enter_details_by_hand" }).eq("id", inquiryId);
    await alertCoordinator(inquiryId, "T1", `Task 1 extraction failed: ${extraction.reason}`);
    return answer(started, 200, { ...base, ok: true, status: "held", reasons: [reason, ...flagReasons], usage, inquiry_id: inquiryId, next_step: "enter_details_by_hand", notice: reason });
  }

  const decision = checkEventDetails(extraction.fields, text);
  await saveDecision(inquiryId, submissionId, { extraction_status: "succeeded", model: EXTRACTION_MODEL, checked }, decision);
  const result = await afterD1(inquiryId, submissionId, decision, usage, text, settings.holidays);
  return answer(started, 200, { ...base, ok: true, status: result.status, reasons: [...result.reasons, ...flagReasons], usage, inquiry_id: inquiryId, d1_result: decision.d1_result, next_step: result.next_step });
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
  await saveDecision(
    inquiryId,
    submission.id,
    { extraction_method: "by_hand", extraction_status: "entered_by_hand", checked: checkedList(settings, null) },
    decision,
  );
  const usage = noUsage();
  const result = await afterD1(inquiryId, submission.id, decision, usage, "", settings.holidays);
  return answer(started, 200, { ...base, ok: true, status: result.status, reasons: result.reasons, usage, inquiry_id: inquiryId, d1_result: decision.d1_result, next_step: result.next_step });
}

/**
 * The client's reply, pasted by an employee: same inquiry ID, back to T1. Details the
 * reply leaves out are copied from the earlier record (memory rule 2), then D1, T3/D2,
 * and T2 run again.
 */
async function handleReply(started: number, body: Record<string, unknown>, userId: string) {
  const base = { dry_run: false };
  const refuse = (httpStatus: number, message: string, status = "refused") =>
    answer(started, httpStatus, { ...base, ok: false, status, reasons: [message], error: message });
  if (body.confirmed !== true) return refuse(400, "Confirm that no client personal details remain before submitting.");
  const inquiryId = typeof body.inquiry_id === "string" ? body.inquiry_id : "";
  if (!/^INQ-\d{4,}$/.test(inquiryId)) return refuse(400, "Unknown inquiry ID.");
  const settings = await readSettings();
  if (settings.paused) return refuse(200, "The agent is paused. Nothing was saved.", "paused");
  const cleaned = clean(body.text);
  if (cleaned.refused) return refuse(400, cleaned.refused);
  if (cleaned.held) return refuse(422, cleaned.held, "held");
  const { text, replaced } = cleaned.result!;
  const flags = findInstructionLikeText(text);

  const { data: previous, error: prevError } = await db
    .from("inquiry_submissions")
    .select("id, fields, deidentified_text")
    .eq("inquiry_id", inquiryId)
    .order("submission_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prevError) throw new Error(`earlier record not read: ${prevError.message}`);

  const { data: submissionId, error: replyError } = await db.rpc("add_client_reply", {
    p_inquiry_id: inquiryId,
    p_deidentified_text: text,
    p_placeholders_replaced: replaced,
    p_submitted_by: userId,
    p_flags: flags,
  });
  if (replyError) return refuse(409, replyError.message);
  if (flags.length) await alertCoordinator(inquiryId, "T1", `Client reply tried to instruct the agent: ${flags.join(" / ")}`);

  const usage = noUsage();
  const extraction = await runExtraction(text, inquiryId, false, EXTRACTION_MODEL, usage);
  const checked = [...checkedList(settings, EXTRACTION_MODEL, replaced), "Earlier record: details the reply leaves out are copied from it"];
  if (!extraction.ok) {
    const reason = extractionHeldReason(extraction.reason);
    await db.from("inquiry_submissions").update({ extraction_status: "failed", extraction_error: extraction.reason, model: EXTRACTION_MODEL, checked }).eq("id", submissionId);
    await db.from("inquiries").update({ next_step: "enter_details_by_hand" }).eq("id", inquiryId);
    await alertCoordinator(inquiryId, "T1", `Task 1 extraction of the client reply failed: ${extraction.reason}`);
    return answer(started, 200, { ...base, ok: true, status: "held", reasons: [reason], usage, inquiry_id: inquiryId, next_step: "enter_details_by_hand" });
  }
  const merged = mergeReplyFields(previous?.fields ?? {}, extraction.fields);
  const decision = checkEventDetails(merged, text);
  await saveDecision(inquiryId, submissionId, { extraction_status: "succeeded", model: EXTRACTION_MODEL, checked }, decision);
  // Later drafting (T2, T5) sees the earlier message too, so it can use the client's own words.
  const conversation = `${previous?.deidentified_text ?? ""}\n\n--- Client reply ---\n${text}`;
  const result = await afterD1(inquiryId, submissionId, decision, usage, conversation, settings.holidays);
  return answer(started, 200, { ...base, ok: true, status: result.status, reasons: result.reasons, usage, inquiry_id: inquiryId, d1_result: decision.d1_result, next_step: result.next_step });
}

/** A new T2 draft after an employee rejected one: the AI uses the reason, or code writes it from the checklist. */
async function handleRedraft(started: number, body: Record<string, unknown>) {
  const base = { dry_run: false };
  const refuse = (httpStatus: number, message: string, status = "refused") =>
    answer(started, httpStatus, { ...base, ok: false, status, reasons: [message], error: message });
  const requestId = Number(body.request_id);
  if (!Number.isInteger(requestId)) return refuse(400, "Unknown message.");
  const settings = await readSettings();
  if (settings.paused) return refuse(200, "The agent is paused. Nothing was saved.", "paused");
  const { data: rejected, error } = await db.from("clarification_requests").select("*").eq("id", requestId).maybeSingle();
  if (error) throw new Error(`message not read: ${error.message}`);
  if (!rejected || rejected.kind !== "request" || rejected.status !== "rejected") return refuse(409, "Only a rejected clarification request can be redrafted.");
  const { data: newer } = await db.from("clarification_requests").select("id").eq("submission_id", rejected.submission_id)
    .eq("kind", "request").gt("id", rejected.id).limit(1);
  if (newer && newer.length) return refuse(409, "A newer draft already exists for this inquiry.");
  const { data: submission } = await db.from("inquiry_submissions").select("fields, deidentified_text").eq("id", rejected.submission_id).single();

  const usage = noUsage();
  const draft = await runClarification({
    issues: rejected.issues, fields: submission?.fields ?? {}, sourceText: submission?.deidentified_text ?? "",
    inquiryId: rejected.inquiry_id, submissionId: rejected.submission_id, dryRun: false, model: DRAFT_MODEL, usage,
    holidays: settings.holidays, rejectionReason: rejected.reject_reason, redraftOf: rejected.id, byHand: body.by_hand === true,
  });
  return answer(started, 200, {
    ...base, ok: true, status: "clarify",
    reasons: [draft.drafted_by === "ai" ? "A new draft was written using the rejection reason. It waits for approval." : "A new draft was written from the checklist. It waits for approval.", ...draft.problems],
    usage, inquiry_id: rejected.inquiry_id, request_id: draft.request_id,
  });
}

/** T7 on one proposal: load the proposal lessons, then run the bounded revision. */
async function runRevision(opts: {
  inquiryId: string | null;
  review: { outcome: string; comments: string; checklist: unknown };
  sections: Record<string, unknown>;
  fields: Record<string, unknown>;
  assessment: Record<string, any>; // deno-lint-ignore no-explicit-any
  inquiryText: string;
  dryRun: boolean;
  usage: Usage;
}) {
  const lessons = await loadLessons("proposal", String(opts.assessment.event_type ?? ""));
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!apiKey) {
    return { lessons, result: { status: "handoff" as const, subtasks: [], summary: "undetermined", evidence: "", unresolved: [], handoff_note: "The AI key is not set up.", ai_calls: 0, ms: 0, conflicts: [] } };
  }
  const { beforeCall, afterCall } = aiHooks("T7 revise_proposal_packet", opts.inquiryId, opts.dryRun, REVISE_MODEL, opts.usage);
  const result = await reviseProposal(apiKey, {
    review: opts.review, sections: opts.sections, fields: opts.fields, assessment: opts.assessment, inquiryText: opts.inquiryText, lessons,
  }, beforeCall, afterCall);
  console.log(JSON.stringify({ inquiry: opts.inquiryId, dry_run: opts.dryRun, t7: result.status, calls: result.ai_calls, ms: result.ms }));
  return { lessons, result };
}

/**
 * After a T6 review (D3 already ran in record_review): learn a lesson from the reason, then
 * run T7 (Needs revision) or draft a clarification request (Needs clarification). Runs once
 * per review; a failure frees the review so it can be tried again.
 */
async function handleProcessReview(started: number, body: Record<string, unknown>) {
  const base = { dry_run: false };
  const refuse = (httpStatus: number, message: string, status = "refused") =>
    answer(started, httpStatus, { ...base, ok: false, status, reasons: [message], error: message });
  const reviewId = Number(body.review_id);
  if (!Number.isInteger(reviewId)) return refuse(400, "Unknown review.");
  const settings = await readSettings();
  if (settings.paused) return refuse(200, "The agent is paused. The review is saved; run the next step once Paused is off.", "paused");

  // Claim the review so T7 never runs twice for it.
  const { data: review, error } = await db.from("proposal_reviews").update({ processed_at: new Date().toISOString() })
    .eq("id", reviewId).is("processed_at", null).select("*").maybeSingle();
  if (error) throw new Error(`review not read: ${error.message}`);
  if (!review) return refuse(409, "This review has already been handled.");

  try {
    const usage = noUsage();
    const reasons: string[] = [];
    const { data: proposal } = await db.from("proposals").select("*").eq("id", review.proposal_id).single();
    const { data: assessment } = await db.from("setup_assessments").select("*").eq("id", proposal.assessment_id).single();
    const { data: sub } = await db.from("inquiry_submissions").select("fields").eq("id", proposal.submission_id).single();
    const { data: subs } = await db.from("inquiry_submissions").select("deidentified_text").eq("inquiry_id", review.inquiry_id).order("submission_number");
    const inquiryText = (subs ?? []).map((s) => s.deidentified_text).join("\n\n--- Client reply ---\n");
    const fields = sub?.fields ?? {};

    const learned = await learnLesson({
      learnedFrom: `proposal_review:${review.id}`, outcome: review.outcome, topic: "proposal", reason: review.comments,
      inquiryId: review.inquiry_id, eventType: String(assessment?.event_type ?? ""), dryRun: false, usage,
    });
    reasons.push(learned.lesson ? `Lesson learned: "${learned.lesson}"` : `No lesson saved (${learned.problem}).`);

    if (review.routed_to === "t2") {
      const draft = await runClarification({
        issues: issuesFromReview(review.comments), fields, sourceText: inquiryText, inquiryId: review.inquiry_id,
        submissionId: proposal.submission_id, dryRun: false, model: DRAFT_MODEL, usage, holidays: settings.holidays,
      });
      reasons.unshift("A clarification request is drafted from the review and waits for an employee's approval.");
      return answer(started, 200, { ...base, ok: true, status: "clarify", reasons, usage, inquiry_id: review.inquiry_id, request_id: draft.request_id });
    }
    if (review.routed_to !== "t7") {
      return answer(started, 200, { ...base, ok: true, status: review.routed_to, reasons, usage, inquiry_id: review.inquiry_id });
    }

    // T7
    const saveRun = async (run: Record<string, unknown>) => {
      const { error: runError } = await db.from("revision_runs").insert({ inquiry_id: review.inquiry_id, review_id: review.id, base_proposal_id: proposal.id, model: REVISE_MODEL, ...run });
      if (runError) throw new Error(`revision run not saved: ${runError.message}`);
    };
    if (proposal.status !== "draft") {
      await saveRun({ status: "handoff", handoff_note: "The proposal changed after the review, so T7 did not run. Review the current version." });
      await db.from("inquiries").update({ next_step: NEXT_STEP.handoff }).eq("id", review.inquiry_id);
      return answer(started, 200, { ...base, ok: true, status: "handoff", reasons: ["The proposal changed after the review, so T7 did not run.", ...reasons], usage, inquiry_id: review.inquiry_id });
    }
    const { lessons, result } = await runRevision({
      inquiryId: review.inquiry_id, review, sections: proposal.sections, fields, assessment, inquiryText, dryRun: false, usage,
    });
    const runRow = {
      status: result.status, subtasks: result.subtasks, summary: result.summary, evidence: result.evidence, unresolved: result.unresolved,
      handoff_note: result.handoff_note, ai_calls: result.ai_calls, ms: result.ms, lessons_applied: lessonsApplied(lessons),
    };
    if (result.status === "revised") {
      const revised = await runProposal({
        inquiryId: review.inquiry_id, submissionId: proposal.submission_id, assessmentId: proposal.assessment_id, fields, assessment,
        sourceText: inquiryText, dryRun: false, model: REVISE_MODEL, usage, editedSections: result.sections, baseVersion: proposal,
        revision: { model: REVISE_MODEL, lessonsApplied: lessonsApplied(lessons) },
      });
      await saveRun({ ...runRow, new_proposal_id: revised.proposal_id });
      reasons.unshift(`Revised — ready for human review: version ${revised.version}. ${result.summary}`);
      return answer(started, 200, { ...base, ok: true, status: "revised", reasons, usage, inquiry_id: review.inquiry_id, proposal_id: revised.proposal_id });
    }
    if (result.status === "blocked") {
      await saveRun(runRow);
      const draft = await runClarification({
        issues: issuesFromConflicts(result.conflicts), fields, sourceText: inquiryText, inquiryId: review.inquiry_id,
        submissionId: proposal.submission_id, dryRun: false, model: DRAFT_MODEL, usage, holidays: settings.holidays,
      });
      reasons.unshift(`Blocked — clarification required. ${result.unresolved.join(" ")} A clarification request is drafted and waits for approval.`);
      return answer(started, 200, { ...base, ok: true, status: "blocked", reasons, usage, inquiry_id: review.inquiry_id, request_id: draft.request_id });
    }
    await saveRun(runRow);
    await db.from("inquiries").update({ next_step: NEXT_STEP.handoff }).eq("id", review.inquiry_id);
    await alertCoordinator(review.inquiry_id, "T7", result.handoff_note);
    reasons.unshift(`T7 handed the proposal back: ${result.handoff_note}`);
    return answer(started, 200, { ...base, ok: true, status: "handoff", reasons, usage, inquiry_id: review.inquiry_id });
  } catch (e) {
    await db.from("proposal_reviews").update({ processed_at: null }).eq("id", reviewId);
    throw e;
  }
}

/** A lesson from an employee's rejection of a clarification draft (with its typed reason). */
async function handleLearnRejection(started: number, body: Record<string, unknown>) {
  const base = { dry_run: false };
  const refuse = (httpStatus: number, message: string, status = "refused") =>
    answer(started, httpStatus, { ...base, ok: false, status, reasons: [message], error: message });
  const requestId = Number(body.request_id);
  if (!Number.isInteger(requestId)) return refuse(400, "Unknown message.");
  const settings = await readSettings();
  if (settings.paused) return refuse(200, "The agent is paused. No lesson was learned.", "paused");
  const { data: rejected } = await db.from("clarification_requests").select("id, inquiry_id, submission_id, status, reject_reason").eq("id", requestId).maybeSingle();
  if (!rejected || rejected.status !== "rejected" || !rejected.reject_reason) return refuse(409, "Only a rejected draft with a reason teaches a lesson.");
  const { data: sub } = await db.from("inquiry_submissions").select("fields").eq("id", rejected.submission_id).single();
  const et = sub?.fields?.event_type;
  const usage = noUsage();
  const learned = await learnLesson({
    learnedFrom: `clarification_request:${rejected.id}`, outcome: "rejected", topic: "clarification request", reason: rejected.reject_reason,
    inquiryId: rejected.inquiry_id, eventType: et?.status === "found" ? normalizeEventType(et.value) : "", dryRun: false, usage,
  });
  return answer(started, 200, {
    ...base, ok: true, status: learned.lesson ? "learned" : "not_learned",
    reasons: [learned.lesson ? `Lesson learned: "${learned.lesson}"` : `No lesson saved (${learned.problem}).`], usage, inquiry_id: rejected.inquiry_id,
  });
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
      case "reply":
        return await handleReply(started, body, userId);
      case "redraft":
        return await handleRedraft(started, body);
      case "draft_proposal":
        return await handleDraftProposal(started, body);
      case "rebuild_proposal":
        return await handleRebuildProposal(started, body, userId);
      case "process_review":
        return await handleProcessReview(started, body);
      case "learn_rejection":
        return await handleLearnRejection(started, body);
      default:
        return answer(started, 400, { ok: false, status: "refused", reasons: ["Unknown action."], dry_run: false, error: "Unknown action." });
    }
  } catch (error) {
    console.error("agent failed", error instanceof Error ? error.message : String(error));
    const message = "Something went wrong on our side. Nothing was sent to the client. Try again, or tell the event coordinator.";
    return answer(started, 500, { ok: false, status: "refused", reasons: [message], dry_run: false, error: message });
  }
});
