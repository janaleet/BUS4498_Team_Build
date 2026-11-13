// The agent's packaged copy of the team's Skill must match the repository word for word,
// and the Skill must ask only for actions the agent can really do.
// Run from the repository root with either:
//   deno run --allow-read tests/skill.test.js
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/skill.test.js
import { FIELD_RULES_MD, SKILL_MD, SKILL_NAME, SKILL_PATH, TEMPLATE_MD } from "../supabase/functions/agent/skill_bundle.js";

const log = typeof print === "function" ? print : console.log;
const load = (path) => (typeof read === "function" ? read(path) : Deno.readTextFileSync(path));
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) passed++;
  else {
    failed++;
    log(`FAIL: ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

const dir = "our_team_agent/agent/skills/prepare-clarification-request";
check("skill lives in agent/skills/", SKILL_PATH === dir);
check("SKILL.md packaged word for word (run supabase/package_skill.py if not)", SKILL_MD === load(`${dir}/SKILL.md`));
check("field rules packaged word for word", FIELD_RULES_MD === load(`${dir}/references/field-rules.md`));
check("template packaged word for word", TEMPLATE_MD === load(`${dir}/assets/clarification-request-template.md`));
check("name matches SKILL.md", SKILL_MD.includes(`name: ${SKILL_NAME}`));
check("SKILL.md links both files", SKILL_MD.includes("references/field-rules.md") && SKILL_MD.includes("assets/clarification-request-template.md"));
const all = SKILL_MD + FIELD_RULES_MD + TEMPLATE_MD;
check("no script or tool the agent can't run", !/python|\.py\b|run `|scripts\//i.test(all));
check("draft only: never sends", /Draft only/.test(SKILL_MD) && /Never send/.test(SKILL_MD));

log(`${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} check(s) failed`);
