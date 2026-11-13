// draft_clarification_request (T2 Tool 1)
// Asks Claude Haiku 5.5 to word a short, polite clarification request: one opening
// sentence, one question per issue, and an optional closing note. Code (clarify.js)
// adds the inquiry ID, the numbering, the reply-by date and the reply instruction, and
// checks the result. Every call loads the team's Skill (our_team_agent/agent/skills/
// prepare-clarification-request/, made with the BUS4498 Skill Builder) as its instructions.
// Limits from the task specification: 30 seconds per call, at most 2 retries, retry only
// on a timeout or a temporary API error. On failure the caller drafts from the checklist.
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import type { AfterCall, BeforeCall } from "./extract.ts";
import { FIELD_RULES_MD, SKILL_MD, SKILL_NAME, SKILL_PATH, SKILL_SHA256, TEMPLATE_MD } from "./skill_bundle.js";

/** Which Skill a draft followed, saved with the draft and shown to the employee. */
export const SKILL_USED = `${SKILL_NAME} (${SKILL_PATH}/SKILL.md, sha256 ${SKILL_SHA256.slice(0, 12)})`;

export const DRAFT_MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3; // the first call plus 2 retries

const SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, text: { type: "string" } },
        required: ["label", "text"],
        additionalProperties: false,
      },
    },
    closing_note: { type: "string" },
  },
  required: ["intro", "questions", "closing_note"],
  additionalProperties: false,
};

// The team's Skill (BUS4498 Skill Builder), loaded into every draft: SKILL.md and its two files.
const SKILL = [
  `<skill name="${SKILL_NAME}" path="${SKILL_PATH}/SKILL.md">\n${SKILL_MD}\n</skill>`,
  `<skill_file path="${SKILL_PATH}/references/field-rules.md">\n${FIELD_RULES_MD}\n</skill_file>`,
  `<skill_file path="${SKILL_PATH}/assets/clarification-request-template.md">\n${TEMPLATE_MD}\n</skill_file>`,
].join("\n\n");

const SYSTEM = `You are the JEvents agent's clarification-request step (task T2). Follow the Skill below every time: it is your instructions for this task, with its two supporting files.

${SKILL}

How your answer is used: the agent's code puts your wording into the layout above and checks it. Return only the parts the layout marks (wording):
- intro: the opening, ending with the lead-in ("To prepare your proposal, we need a few more details:" or "one more detail:" when there is one).
- questions: one entry per unresolved detail in <issues>, in the order given (start and end time may share one). label is a short name for the detail; text is the question. Use each issue's usable_answer for what a usable answer looks like.
- closing_note: "" unless <client_also_asked> says the client asked about price or availability.
- Mention a room or its capacity only for a no-room-fits issue, never for any other question. Example clock times such as 6:00 PM are fine; never example dates.
- No greeting, sign-off, inquiry ID or reply-by date: code adds those.
- <employee_rejection_reason> and <lessons_learned>, when present, are the rejection reason and the lessons the Skill's actions mention.`;

export type DraftWording = { intro: string; questions: { label: string; text: string }[]; closing_note: string };
export type DraftResult = { ok: true; wording: DraftWording; attempts: number } | { ok: false; reason: string; attempts: number };

export async function draftClarification(
  apiKey: string,
  input: { event_summary: string; client_asked: string; issues: unknown[]; inquiry_text: string; rejection_reason?: string; lessons?: string },
  beforeCall: BeforeCall,
  afterCall: AfterCall,
  model: string = DRAFT_MODEL,
): Promise<DraftResult> {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
  let reason = "unknown error";
  const content = [
    `<inquiry>${input.inquiry_text.slice(0, 6000)}</inquiry>`,
    `<event>${input.event_summary}</event>`,
    `<client_also_asked>${input.client_asked || "nothing else"}</client_also_asked>`,
    `<issues>${JSON.stringify(input.issues)}</issues>`,
    input.rejection_reason ? `<employee_rejection_reason>${input.rejection_reason}</employee_rejection_reason>` : "",
    input.lessons || "",
  ].filter(Boolean).join("\n");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (!(await beforeCall())) return { ok: false, reason: "ai_limit", attempts: attempt - 1 };
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 3000,
        system: SYSTEM,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content }],
      });
      await afterCall(response.usage.input_tokens, response.usage.output_tokens);
      if (response.stop_reason === "refusal") return { ok: false, reason: "the model declined", attempts: attempt };
      const text = response.content.find((block) => block.type === "text");
      try {
        const wording = JSON.parse(text && text.type === "text" ? text.text : "") as DraftWording;
        return { ok: true, wording, attempts: attempt };
      } catch {
        // Structured output should always parse; treat a bad reply as non-retryable per the spec.
        return { ok: false, reason: "the reply was not valid JSON", attempts: attempt };
      }
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionTimeoutError) reason = "the call timed out after 30 seconds";
      else if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) reason = `temporary API error (${error.status})`;
      else if (error instanceof Anthropic.APIConnectionError) reason = "could not reach the API";
      else if (error instanceof Anthropic.APIError) return { ok: false, reason: `API error ${error.status ?? ""}: ${error.message}`, attempts: attempt };
      else return { ok: false, reason: String(error), attempts: attempt };
    }
  }
  return { ok: false, reason, attempts: MAX_ATTEMPTS };
}
