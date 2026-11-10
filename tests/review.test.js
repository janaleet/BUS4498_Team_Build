// Automated checks for Group 5: the T7 controller rules (which subtask may come next, how a
// run ends), the T2 questions made from a review or a T7 conflict, and the lesson check.
// Run from the repository root with either:
//   deno run --allow-read tests/review.test.js
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/review.test.js
import {
  allowedNext, chooseNext, clientFacingProblems, issuesFromConflicts, issuesFromReview, lessonsApplied, lessonsBlock, MAX_CALLS, MAX_REVISIONS, newState, outcome,
  RETRY_WAIT_MS, RUN_LIMIT_MS, CALL_TIMEOUT_MS,
} from "../supabase/functions/agent/revise.js";
import { lessonProblem } from "../supabase/functions/agent/lesson-rules.js";

const log = typeof print === "function" ? print : console.log;
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) passed++;
  else {
    failed++;
    log(`FAIL: ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Limits from the T7 specification.
check("limits: 8 calls, 10 minutes, 60 s per call, 30 s retry wait", MAX_CALLS === 8 && RUN_LIMIT_MS === 600000 && CALL_TIMEOUT_MS === 60000 && RETRY_WAIT_MS === 30000);

// Order: inspect first; revise only after a clean verify; check only after a revision.
{
  const s = newState();
  check("first subtask is inspect", same(allowedNext(s), ["inspect_review_findings"]));
  check("model can't skip inspect", chooseNext(s, "revise_proposal_packet") === "inspect_review_findings");
  s.inspected = true;
  check("after inspect: verify only", same(allowedNext(s), ["verify_against_source"]));
  check("model can't revise before verify", chooseNext(s, "revise_proposal_packet") === "verify_against_source");
  s.verified = true;
  check("after a clean verify: revise", same(allowedNext(s), ["revise_proposal_packet"]));
  s.revised = { room_notes: "x" };
  s.revisions = 1;
  s.complete = null;
  check("after revise: check", same(allowedNext(s), ["check_packet_completeness"]));
  s.complete = true;
  check("complete: nothing left", same(allowedNext(s), []) && chooseNext(s, "revise_proposal_packet") === "stop");
  check("complete -> revised", outcome(s, "").status === "revised");
}
// A conflict stops the run as Blocked, with no revision (fixture 9's case).
{
  const s = newState();
  s.inspected = true;
  s.verified = true;
  s.conflicts = [{ detail: "Guest count", review_says: "120", source_says: "80" }];
  check("conflict: revise not allowed", !allowedNext(s).includes("revise_proposal_packet"));
  const end = outcome(s, "");
  check("conflict -> blocked", end.status === "blocked");
  const issues = issuesFromConflicts(s.conflicts);
  check("conflict -> one T2 question", issues.length === 1 && issues[0].label === "Guest count" && issues[0].status === "conflicting" && issues[0].known === "80");
  check("T2 question never mentions the reviewer", !/review/i.test(JSON.stringify({ l: issues[0].label, k: issues[0].known, u: issues[0].usable_answer })));
}
// A change outside the revisable sections goes back to a person.
{
  const s = newState();
  s.inspected = true;
  s.verified = true;
  s.outside = ["room"];
  check("outside change: revise not allowed", !allowedNext(s).includes("revise_proposal_packet"));
  const end = outcome(s, "");
  check("outside change -> handoff naming it", end.status === "handoff" && end.note.includes("room"));
}
// A failed check allows one more revision, then hands off.
{
  const s = newState();
  Object.assign(s, { inspected: true, verified: true, revised: { room_notes: "x" }, revisions: 1, complete: false, problems: ["missing florist line"] });
  check("failed check: revise again", allowedNext(s).includes("revise_proposal_packet"));
  s.revisions = MAX_REVISIONS;
  check("after 2 revisions: no more", !allowedNext(s).includes("revise_proposal_packet"));
  const end = outcome(s, "");
  check("still incomplete -> handoff with problems", end.status === "handoff" && end.note.includes("missing florist line"));
}
// A limit hands off.
{
  const s = newState();
  s.inspected = true;
  const end = outcome(s, "the limit of 8 AI calls was reached");
  check("limit -> handoff", end.status === "handoff" && end.note.includes("8 AI calls"));
}
// Needs clarification: one question per line of the reason.
{
  const issues = issuesFromReview("- Confirm the DJ's arrival time\n2. Ask whether the florist needs access before 3 PM\n\nok");
  check("two lines -> two questions (short line dropped)", issues.length === 2, JSON.stringify(issues.map((i) => i.label)));
  check("bullets and numbers removed", issues[0].evidence === "Confirm the DJ's arrival time" && issues[1].evidence.startsWith("Ask whether"));
  check("at most 6 questions", issuesFromReview(Array.from({ length: 9 }, (_, i) => `Question number ${i}`).join("\n")).length === 6);
  check("empty reason -> none", issuesFromReview("").length === 0);
}
// Lessons in the prompt and on the record.
{
  const lessons = [{ id: 4, lesson: "Quote the client's words." }, { id: 2, lesson: "List vendor arrival times." }];
  const block = lessonsBlock(lessons);
  check("lessons numbered in their own block", block.startsWith("<lessons_learned>") && block.includes("1. Quote") && block.includes("2. List"));
  check("no lessons -> no block", lessonsBlock([]) === "");
  check("lessons applied names each lesson", same(lessonsApplied(lessons), ["Lesson 4: Quote the client's words.", "Lesson 2: List vendor arrival times."]));
}
// Client-facing text never shows the review or the sources (fixture 8's first run).
check("reviewer note caught", clientFacingProblems({ setup_requirements: ["Per reviewer request: the client's decorations go up before guests arrive"] }).length === 1);
check("inquiry note caught", clientFacingProblems({ unresolved_items: ["Confirm decorations; the inquiry does not mention them."] }).length === 1);
check("plain client text passes", clientFacingProblems({
  room_notes: "Studio A suits a relaxed afternoon reception.",
  setup_requirements: ["Your decorations can go up before guests arrive (timing to be confirmed)."],
  unresolved_items: ["Who will bring the birthday cake?"], assumptions: ["None"],
}).length === 0);

// The lesson check: caution only, no contact details.
check("good lesson passes", lessonProblem("Quote the client's own words for each missing detail.") === null);
check("cautious 'never release' passes", lessonProblem("Never release a proposal that lists an outside vendor without an arrival time.") === null);
check("loosening caught (skip)", lessonProblem("Skip the privacy check for repeat clients.") !== null);
check("loosening caught (auto-approve)", lessonProblem("Auto-approve template proposals.") !== null);
check("phone caught", lessonProblem("Call the venue at (805) 555-0142 first.") !== null);
check("email caught", lessonProblem("Send questions to events@example.com.") !== null);
check("inquiry ID caught", lessonProblem("Remember INQ-0002 needs a stage.") !== null);
check("too long caught", lessonProblem("x".repeat(301)) !== null);

log(`${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} check(s) failed`);
