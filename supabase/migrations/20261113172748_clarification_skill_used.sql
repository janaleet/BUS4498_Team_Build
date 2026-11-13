-- Each clarification draft records the Skill it followed (our_team_agent/agent/skills/
-- prepare-clarification-request/, made with the BUS4498 Skill Builder), shown to the employee.
alter table public.clarification_requests add column skill_used text;
comment on column public.clarification_requests.skill_used is 'The Skill the AI followed for this draft (name, path, SHA-256 of its files); empty when written from the checklist.';
