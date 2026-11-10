// Code's check of a lesson before it is saved (memory rules 4 and 9): one short sentence,
// no contact details or inquiry IDs, and nothing that would loosen a rule.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const LOOSENING = /\b(you may|it is fine to|no need to|don't need to|skip|ignore|bypass)\b|\b(auto-?approve|automatically (approve|release|send))\b/i;

/** Why a lesson can't be saved, or null when it is fine. */
export function lessonProblem(lesson) {
  const text = String(lesson || "").trim();
  if (text.length < 5 || text.length > 300) return "the lesson must be one short sentence";
  if (EMAIL.test(text) || PHONE.test(text)) return "the lesson contains contact details";
  if (/INQ-\d{4,}/.test(text)) return "the lesson names an inquiry";
  if (LOOSENING.test(text)) return "the lesson would loosen a rule";
  return null;
}
