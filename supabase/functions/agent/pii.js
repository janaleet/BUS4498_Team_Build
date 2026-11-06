// remove_personal_details (T1 Tool 1)
// Fixed rules that replace client names, email addresses, phone numbers and
// street addresses with placeholders. Runs before anything is saved or sent to
// the AI model. Company and organization names are kept on purpose.
// See our_team_agent/docs/setup-and-routing-rules.md, section 2.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

// US-style numbers such as (805) 555-0142, 805.555.0142, +1 805 555 0142,
// and international numbers that start with +.
const PHONE_US = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b(?:\s*(?:x|ext\.?)\s*\d{1,5})?/gi;
const PHONE_INTL = /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b/g;

const STREET_SUFFIX =
  "(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Parkway|Pkwy|Circle|Cir|Highway|Hwy)";
// "1450 Foothill Blvd, Apt 3, San Luis Obispo, CA 93405"
const STREET = new RegExp(
  "\\b\\d{1,6}\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Z][A-Za-z'’-]*\\.?\\s+){1,4}" + STREET_SUFFIX + "\\b\\.?" +
    "(?:,?\\s+(?:Apt|Apartment|Suite|Ste|Unit|#)\\.?\\s*[A-Za-z0-9-]+)?" +
    "(?:,\\s*[A-Z][A-Za-z.]*(?:\\s+[A-Z][A-Za-z.]*){0,3},\\s*[A-Z]{2}(?:\\s+\\d{5}(?:-\\d{4})?)?)?",
  "g",
);
const PO_BOX = /\bP\.?\s?O\.?\s+Box\s+\d+\b/gi;
// A city, state and ZIP line on its own: "San Luis Obispo, CA 93405"
const CITY_STATE_ZIP = /\b[A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*){0,3},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g;

const NAME_WORD = "\\p{Lu}[\\p{Ll}'’-]+";
const FULL_NAME = `${NAME_WORD}(?:\\s+${NAME_WORD}){0,2}`;

// "I'm Priya Shah", "My name is Priya"
const SELF_INTRO = new RegExp(`\\b(I'm|I’m|I am|[Mm]y name is)\\s+(${FULL_NAME})`, "gu");
// "Mr. Daniel Ortiz", "Dr Lee"
const TITLED = new RegExp(`\\b(?:Mr|Mrs|Ms|Miss|Mx|Dr)\\.?\\s+${NAME_WORD}(?:\\s+${NAME_WORD})?`, "gu");
// "my fiancé Daniel", "my sister Ana Lopez"
const RELATION = new RegExp(
  `\\b([Mm]y\\s+(?:fianc[eé]e?|husband|wife|partner|spouse|sister|brother|mom|mother|dad|father|daughter|son|friend|colleague|coworker|boss|manager|assistant|client))(,?)\\s+(${FULL_NAME})`,
  "gu",
);

// Form fields: "Name: Priya Shah", "Phone: ...", "Address: ..."
const NAME_LABELS = /^(\s*(?:full\s+name|first\s+name|last\s+name|contact\s+name|client\s+name|contact|name|organizer|bride|groom|host)\s*[:\-–]\s*)(.+)$/gim;
const EMAIL_LABELS = /^(\s*(?:e-?mail(?:\s+address)?)\s*[:\-–]\s*)(.+)$/gim;
const PHONE_LABELS = /^(\s*(?:phone(?:\s+number)?|mobile|cell|tel(?:ephone)?)\s*[:\-–]\s*)(.+)$/gim;
const ADDRESS_LABELS = /^(\s*(?:(?:street\s+|mailing\s+|home\s+)?address)\s*[:\-–]\s*)(.+)$/gim;

const CLOSINGS =
  /^\s*(?:thanks|thank you|thanks again|many thanks|best|best regards|kind regards|warm regards|warmest regards|regards|warmly|sincerely|cheers|all the best|talk soon|take care)[\s,!.]*$/i;

// Words that look like names but are not (so a learned name never erases them).
const NOT_NAMES = new Set([
  "The", "We", "Our", "Hello", "Hi", "Hey", "Dear", "Thanks", "Thank", "Best", "Regards", "Warmly",
  "Room", "Studio", "Garden", "Terrace", "Executive", "Boardroom", "Grand", "Ballroom",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "And",
]);

const PLACEHOLDER_ONLY = /^[\s,&|/-]*(?:\[(?:NAME|EMAIL|PHONE|ADDRESS)\][\s,&|/-]*(?:and\s+)?)*$/i;

export class PersonalDetailsError extends Error {}

/**
 * Remove personal details from one inquiry.
 * Returns { text, replaced: {NAME, EMAIL, PHONE, ADDRESS}, warnings: [] }.
 * Throws PersonalDetailsError if an email address or phone number still remains.
 */
export function removePersonalDetails(input) {
  if (typeof input !== "string") throw new PersonalDetailsError("Inquiry text is missing.");
  const replaced = { NAME: 0, EMAIL: 0, PHONE: 0, ADDRESS: 0 };
  const names = new Set();
  const count = (kind) => () => {
    replaced[kind] += 1;
    return `[${kind}]`;
  };
  const learn = (fullName) => {
    for (const part of [fullName, ...fullName.split(/\s+/)]) {
      if (part.length >= 2 && !NOT_NAMES.has(part)) names.add(part);
    }
  };

  let text = input.replace(/\r\n?/g, "\n");

  // 1. Labeled form fields (the label stays, the value goes).
  text = text.replace(EMAIL_LABELS, (_m, label) => label + count("EMAIL")());
  text = text.replace(PHONE_LABELS, (_m, label) => label + count("PHONE")());
  text = text.replace(ADDRESS_LABELS, (_m, label) => label + count("ADDRESS")());
  text = text.replace(NAME_LABELS, (_m, label, value) => {
    if (PLACEHOLDER_ONLY.test(value)) return label + value;
    value.split(/\s*(?:,|&|\band\b)\s*/).forEach((n) => /^[A-Z]/.test(n.trim()) && learn(n.trim()));
    return label + count("NAME")();
  });

  // 2. Emails, phone numbers and street addresses anywhere in the text.
  text = text.replace(EMAIL, count("EMAIL"));
  text = text.replace(STREET, count("ADDRESS"));
  text = text.replace(PO_BOX, count("ADDRESS"));
  text = text.replace(CITY_STATE_ZIP, count("ADDRESS"));
  text = text.replace(PHONE_INTL, count("PHONE"));
  text = text.replace(PHONE_US, count("PHONE"));

  // 3. Names introduced in the message body.
  text = text.replace(SELF_INTRO, (_m, intro, name) => {
    learn(name);
    return `${intro} ${count("NAME")()}`;
  });
  text = text.replace(RELATION, (_m, relation, comma, name) => {
    learn(name);
    return `${relation}${comma} ${count("NAME")()}`;
  });
  text = text.replace(TITLED, (m) => {
    learn(m.replace(/^\S+\s+/, ""));
    return count("NAME")();
  });

  // 4. The signature: the first non-empty line after a closing such as "Thanks,".
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!CLOSINGS.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    if (j >= lines.length) continue;
    const line = lines[j];
    if (PLACEHOLDER_ONLY.test(line)) continue;
    const signature = new RegExp(`^\\s*(${FULL_NAME})(?:\\s*(?:&|and|,)\\s*(${FULL_NAME}))?\\s*[,.]?\\s*$`, "u");
    const match = line.match(signature);
    if (match) {
      learn(match[1]);
      if (match[2]) learn(match[2]);
      lines[j] = match[2] ? `${count("NAME")()} and ${count("NAME")()}` : count("NAME")();
    }
  }
  text = lines.join("\n");

  // 5. Every learned name, wherever else it appears (longest first).
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])(?:['’]s)?`, "gu"), count("NAME"));
  }

  // 6. Safety check: no email address or phone number may remain.
  EMAIL.lastIndex = 0;
  PHONE_US.lastIndex = 0;
  if (EMAIL.test(text) || PHONE_US.test(text)) {
    throw new PersonalDetailsError("An email address or phone number could not be removed.");
  }

  const warnings = [];
  if (replaced.NAME === 0) {
    warnings.push("No client names were found automatically. Check the text for names before you submit.");
  }
  return { text, replaced, warnings };
}
