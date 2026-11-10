// T7 · Revise proposal packet — the fixed parts, in code.
// The model (revise.ts, Claude Sonnet 5.5) does the four permitted subtasks; this file
// decides which subtasks may come next, enforces the limits, and turns the result into
// the next step. Limits from the task specification: 8 AI calls (four subtasks plus one
// retry each), 10 minutes per run, 60 seconds per call, one retry after 30 seconds.

export const SUBTASKS = ["inspect_review_findings", "verify_against_source", "revise_proposal_packet", "check_packet_completeness"];
export const MAX_CALLS = 8;
export const RUN_LIMIT_MS = 10 * 60 * 1000;
export const CALL_TIMEOUT_MS = 60 * 1000;
export const RETRY_WAIT_MS = 30 * 1000;
export const MAX_REVISIONS = 2; // revise_proposal_packet at most twice in one run

// Sections T7 may change. Everything else in the proposal comes from the client's details
// (T1) or the setup rules (T3); a requested change there goes back to a person.
export const REVISABLE = ["room_notes", "setup_requirements", "unresolved_items", "assumptions"];
export const SECTION_NAMES = [...REVISABLE, "event_summary", "room", "tables", "chairs", "av_equipment"];

/**
 * A fresh run state.
 * @returns {{ done: string[], inspected: boolean, verified: boolean,
 *   conflicts: { detail: string, review_says: string, source_says: string }[], unsupported: string[], outside: string[],
 *   revisions: number, revised: Record<string, unknown> | null, complete: boolean | null, problems: string[] }}
 */
export function newState() {
  return { done: [], inspected: false, verified: false, conflicts: [], unsupported: [], outside: [], revisions: 0, revised: null, complete: null, problems: [] };
}

/**
 * Which subtasks may run next, from what has happened so far. revise needs a verify with
 * no conflicts and no change outside the revisable sections; check needs a revision.
 */
export function allowedNext(state) {
  if (!state.inspected) return ["inspect_review_findings"];
  const allowed = [];
  if (!state.verified) allowed.push("verify_against_source");
  if (state.verified && !state.conflicts.length && !state.outside.length && state.revisions < MAX_REVISIONS &&
      (!state.revised || state.complete === false)) allowed.push("revise_proposal_packet");
  if (state.revised && state.complete === null) allowed.push("check_packet_completeness");
  return allowed;
}

/** The model's choice if it is allowed, otherwise the first allowed subtask, otherwise stop. */
export function chooseNext(state, suggestion) {
  const allowed = allowedNext(state);
  if (allowed.includes(suggestion)) return suggestion;
  return allowed[0] || "stop";
}

/**
 * How the run ends, once no subtask is left or a limit is reached.
 * Returns { status: "revised" | "blocked" | "handoff", note }.
 */
export function outcome(state, limitReason) {
  if (state.conflicts.length) {
    return { status: "blocked", note: "The review and the client's details disagree, so nothing was revised. The question goes to the client (T2)." };
  }
  if (state.revised && state.complete === true) return { status: "revised", note: "Not applicable" };
  if (limitReason) return { status: "handoff", note: `Stopped: ${limitReason}. The reviewer decides what to do next; edit the sections by hand if needed.` };
  if (state.outside.length) {
    return { status: "handoff", note: `The review asks to change ${state.outside.join(", ")}, which come from the client's details or the setup rules, not from T7. Change the source (a clarification request, or the Rooms page) or edit by hand.` };
  }
  if (state.revised && state.complete === false) return { status: "handoff", note: `The revised draft still has problems: ${state.problems.join(" ")}` };
  return { status: "handoff", note: "T7 could not make progress on this review." };
}

// Words that belong in the reviewer's notes, never in the client's proposal.
const INTERNAL = /\b(review|reviewer|reviewer's|per (the )?review(er)?|the inquiry (does|did)|inquiry does not|not (mentioned|stated) in the inquiry|source details?|setup assessment|sources?)\b/i;

/** Problems with revised text that would show internal notes to the client. */
export function clientFacingProblems(sections) {
  const problems = [];
  for (const key of REVISABLE) {
    const v = sections[key];
    for (const line of Array.isArray(v) ? v : [v]) {
      if (line && INTERNAL.test(String(line))) problems.push(`The client's text in ${key.replace(/_/g, " ")} mentions the review or the sources: "${String(line).slice(0, 120)}".`);
    }
  }
  return problems;
}

/** Questions for T2 from T7's conflicts (the reviewer is never mentioned). */
export function issuesFromConflicts(conflicts) {
  return conflicts.map((c) => ({
    field: "conflict",
    label: c.detail,
    status: "conflicting",
    known: c.source_says,
    evidence: c.source_says,
    usable_answer: /guest/i.test(c.detail) ? "one number of guests" : `the correct ${String(c.detail).toLowerCase()}`,
    source: "T7 · details disagree",
  }));
}

/** Questions for T2 from a reviewer's Needs clarification: one per line of the reason. */
export function issuesFromReview(comments) {
  return String(comments || "").split(/\n+/).map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim()).filter((line) => line.length >= 3)
    .slice(0, 6).map((line) => ({
      field: "review",
      label: line.length > 60 ? `${line.slice(0, 57)}…` : line,
      status: "missing",
      known: "",
      evidence: line,
      usable_answer: line,
      source: "T6 · needs clarification",
    }));
}

/** Lessons for the prompt: numbered, kept apart from the rules. */
export function lessonsBlock(lessons) {
  if (!lessons || !lessons.length) return "";
  return `<lessons_learned>\n${lessons.map((l, i) => `${i + 1}. ${l.lesson}`).join("\n")}\n</lessons_learned>`;
}

/** "Lesson 12: …" lines saved with a decision, so the reviewer sees what was applied. */
export function lessonsApplied(lessons) {
  return (lessons || []).map((l) => `Lesson ${l.id}: ${l.lesson}`);
}
