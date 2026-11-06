// Find text in an inquiry that tries to instruct the agent (permission rule 7).
// Such text is data: it is flagged for a person and never followed. It never
// changes a switch, a limit, or a decision.

const INSTRUCTION_LIKE = [
  /\bignore\s+(?:the\s+|all\s+|any\s+|your\s+|previous\s+)*(?:rules|instructions|limits|guidelines)\b/i,
  /\bskip\s+the\s+(?:questions|review|checks?)\b/i,
  /\bmark\s+(?:it|this|the\s+(?:proposal|request|inquiry))\s+(?:as\s+)?approved\b/i,
  /\bapprove\s+(?:it|this|the\s+(?:proposal|request|inquiry))\b/i,
  /\b(?:email|send)\s+(?:it|this|the\s+proposal)\s+(?:to\s+us\s+)?(?:right\s+away|immediately|now)\b/i,
  /\bnew\s+(?:rule|instructions?)\b/i,
  /\bnote\s+to\s+(?:the\s+)?(?:assistant|ai|agent|model|bot|whoever\s+(?:processes|reads|handles)\b)/i,
  /\b(?:system\s+prompt|you\s+are\s+now|act\s+as)\b/i,
];

/**
 * Return the lines of the text that look like instructions to the agent,
 * each trimmed to 200 characters. An empty list means nothing was found.
 */
export function findInstructionLikeText(text) {
  if (typeof text !== "string") return [];
  const found = [];
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (trimmed && INSTRUCTION_LIKE.some((pattern) => pattern.test(trimmed))) {
      found.push(trimmed.slice(0, 200));
    }
  }
  return found.slice(0, 10);
}
