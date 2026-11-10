-- Group 5: T6 Human-review proposal packet, D3 Review outcome, T7 Revise proposal packet,
-- release, and the lessons the agent learns.
--   proposal_reviews: one T6 review per proposal version (checklist, outcome, reason, who, when).
--   record_review():  the recorded click; saves the review and applies D3 in the database.
--   revision_runs:    one T7 run per review, with what it did and why it stopped.
--   lessons:          one lesson per reviewer outcome with a reason; reviewers switch them off.
-- Never: release without every checklist item ticked; a fourth revision round; a second
-- review of the same version; a second T7 run for the same review; a second lesson from
-- the same outcome; client contact details in any of these rows.

-- ---------------------------------------------------------------------------
-- Proposals: released status, the revision round, and what the agent looked at.
-- ---------------------------------------------------------------------------
alter table public.proposals drop constraint proposals_status_check;
alter table public.proposals add constraint proposals_status_check check (status in ('draft', 'superseded', 'released'));
alter table public.proposals drop constraint proposals_drafted_by_check;
alter table public.proposals add constraint proposals_drafted_by_check check (drafted_by in ('code', 'ai', 'by_hand', 'employee_edit', 'revision'));
alter table public.proposals
  add column revision_round integer not null default 0 check (revision_round between 0 and 2),
  add column lessons_applied text[] not null default '{}',
  add column released_by uuid references auth.users (id) on delete set null,
  add column released_at timestamptz,
  add constraint released_has_who check (status <> 'released' or (released_by is not null and released_at is not null));
-- One released proposal per inquiry.
create unique index proposals_one_released on public.proposals (inquiry_id) where status = 'released';

alter table public.clarification_requests add column lessons_applied text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- T6 reviews
-- ---------------------------------------------------------------------------
create table public.proposal_reviews (
  id bigint generated always as identity primary key,
  inquiry_id text not null references public.inquiries (id) on delete restrict,
  proposal_id bigint not null unique references public.proposals (id) on delete restrict,
  revision_round integer not null check (revision_round between 0 and 2),
  outcome text not null check (outcome in ('ready', 'needs_revision', 'needs_clarification')),
  checklist jsonb not null,
  comments text not null default '',
  routed_to text not null check (routed_to in ('release', 't7', 't2', 'coordinator')),
  reviewed_by uuid not null references auth.users (id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  processed_at timestamptz,
  -- Ready for release only with every checklist item ticked.
  constraint ready_needs_full_checklist check (
    outcome <> 'ready' or (
      (checklist ->> 'sections_complete')::boolean is true and
      (checklist ->> 'matches_event_details')::boolean is true and
      (checklist ->> 'matches_setup')::boolean is true and
      (checklist ->> 'unresolved_visible')::boolean is true and
      (checklist ->> 'no_personal_details')::boolean is true)),
  constraint not_ready_needs_reason check (outcome = 'ready' or length(btrim(comments)) >= 3),
  constraint comments_length check (length(comments) <= 4000),
  constraint no_email_in_comments check (comments !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}'),
  constraint no_phone_in_comments check (comments !~ '\(?\m\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\M')
);
comment on table public.proposal_reviews is 'One T6 review per proposal version: the quality checklist, the outcome (Ready for release, Needs revision, Needs clarification), the reviewer''s reason, the revision round, where D3 routed it, and who reviewed it and when.';
create index proposal_reviews_inquiry_id_idx on public.proposal_reviews (inquiry_id);

-- The recorded click. D3 runs here so the routing and the round limit can't be skipped.
create or replace function public.record_review(p_proposal_id bigint, p_outcome text, p_checklist jsonb, p_comments text)
returns public.proposal_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals;
  v_inquiry public.inquiries;
  v_round integer;
  v_route text;
  v_row public.proposal_reviews;
  v_comments text := btrim(coalesce(p_comments, ''));
begin
  if not private.is_staff() then
    raise exception 'Only signed-in staff can review proposals.' using errcode = '42501';
  end if;
  if p_outcome not in ('ready', 'needs_revision', 'needs_clarification') then
    raise exception 'Choose Ready for release, Needs revision, or Needs clarification.' using errcode = '22023';
  end if;
  select * into v_proposal from public.proposals where id = p_proposal_id for update;
  if not found or v_proposal.status <> 'draft' then
    raise exception 'Only the current draft can be reviewed.' using errcode = '22023';
  end if;
  if exists (select 1 from public.proposal_reviews where proposal_id = p_proposal_id) then
    raise exception 'This version has already been reviewed.' using errcode = '23505';
  end if;
  select * into v_inquiry from public.inquiries where id = v_proposal.inquiry_id for update;
  if v_inquiry.status in ('stopped_no_response', 'stopped_coordinator_review') then
    raise exception 'This inquiry is stopped.' using errcode = '22023';
  end if;
  v_round := v_inquiry.revision_round;
  if p_outcome <> 'ready' and length(v_comments) < 3 then
    raise exception 'Say what needs to change (at least 3 characters).' using errcode = '22023';
  end if;

  if p_outcome = 'ready' then
    v_route := 'release';
  elsif p_outcome = 'needs_clarification' then
    v_route := 't2';
  elsif v_round >= 2 then
    v_route := 'coordinator';   -- a third Needs revision: T7 does not run
  else
    v_route := 't7';
  end if;

  insert into public.proposal_reviews
    (inquiry_id, proposal_id, revision_round, outcome, checklist, comments, routed_to, reviewed_by,
     processed_at)
  values
    (v_proposal.inquiry_id, p_proposal_id, v_round, p_outcome, coalesce(p_checklist, '{}'::jsonb), v_comments, v_route,
     (select auth.uid()), case when v_route = 'release' then now() else null end)
  returning * into v_row;

  if v_route = 'release' then
    update public.proposals set status = 'released', released_by = (select auth.uid()), released_at = now() where id = p_proposal_id;
    update public.inquiries set status = 'ready', next_step = 'released', updated_at = now() where id = v_proposal.inquiry_id;
  elsif v_route = 'coordinator' then
    update public.inquiries set status = 'stopped_coordinator_review', next_step = 'stopped', revision_round = 3, updated_at = now()
     where id = v_proposal.inquiry_id;
    insert into public.coordinator_alerts (inquiry_id, task, problem)
    values (v_proposal.inquiry_id, 'T6', 'A third Needs revision (after 2 revision rounds). Stopped – coordinator review. Reason: ' || left(v_comments, 500));
  elsif v_route = 't7' then
    update public.inquiries set revision_round = v_round + 1, next_step = 't7_revision', updated_at = now() where id = v_proposal.inquiry_id;
  else
    update public.inquiries set next_step = 't2_clarification', updated_at = now() where id = v_proposal.inquiry_id;
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- T7 runs
-- ---------------------------------------------------------------------------
create table public.revision_runs (
  id bigint generated always as identity primary key,
  inquiry_id text not null references public.inquiries (id) on delete restrict,
  review_id bigint not null unique references public.proposal_reviews (id) on delete restrict,
  base_proposal_id bigint not null references public.proposals (id) on delete restrict,
  new_proposal_id bigint references public.proposals (id) on delete restrict,
  status text not null check (status in ('revised', 'blocked', 'handoff')),
  subtasks text[] not null default '{}',
  summary text not null default '',
  evidence text not null default '',
  unresolved text[] not null default '{}',
  handoff_note text not null default '',
  ai_calls integer not null default 0 check (ai_calls between 0 and 8),
  ms integer not null default 0,
  model text,
  lessons_applied text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint revised_has_version check (status <> 'revised' or new_proposal_id is not null),
  constraint no_email_in_run check ((summary || evidence || handoff_note || array_to_string(unresolved, ' ')) !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}')
);
comment on table public.revision_runs is 'One T7 run per Needs revision review: the subtasks it did, how many AI calls and how long, and its result: Revised (a new proposal version for review), Blocked (a question for the client goes to T2), or handed back to the reviewer.';
create index revision_runs_inquiry_id_idx on public.revision_runs (inquiry_id);

-- ---------------------------------------------------------------------------
-- Lessons (memory plan: learned only from a reviewer's rejection with a typed reason)
-- ---------------------------------------------------------------------------
create table public.lessons (
  id bigint generated always as identity primary key,
  lesson text not null check (length(btrim(lesson)) between 5 and 300),
  topic text not null check (topic in ('clarification request', 'proposal')),
  event_type text,
  learned_from text not null check (learned_from ~ '^(proposal_review|clarification_request):\d+$'),
  outcome text not null check (outcome in ('needs_revision', 'needs_clarification', 'rejected')),
  inquiry_id text references public.inquiries (id) on delete restrict,
  reason text not null,
  model text,
  active boolean not null default true,
  switched_by uuid references auth.users (id) on delete set null,
  switched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (learned_from, outcome),
  constraint no_email_in_lesson check ((lesson || ' ' || reason) !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}'),
  constraint no_phone_in_lesson check ((lesson || ' ' || reason) !~ '\(?\m\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\M')
);
comment on table public.lessons is 'What the agent learned from a reviewer''s outcome with a typed reason: one sentence, its topic, where it came from, and whether it is on. Adds caution only; never approves or loosens a rule. Never expires; a reviewer switches it off.';
create index lessons_active_topic_idx on public.lessons (topic, created_at desc) where active;

create or replace function public.set_lesson_active(p_id bigint, p_active boolean)
returns public.lessons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.lessons;
begin
  if not private.is_staff() then
    raise exception 'Only signed-in staff can switch lessons.' using errcode = '42501';
  end if;
  update public.lessons set active = coalesce(p_active, false), switched_by = (select auth.uid()), switched_at = now()
   where id = p_id
  returning * into v_row;
  if not found then raise exception 'Unknown lesson.' using errcode = '22023'; end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and row-level security: staff read; changes only through the functions or the agent.
-- ---------------------------------------------------------------------------
revoke all on public.proposal_reviews, public.revision_runs, public.lessons from anon, authenticated;
grant select on public.proposal_reviews, public.revision_runs, public.lessons to authenticated;
grant all on public.proposal_reviews, public.revision_runs, public.lessons to service_role;

alter table public.proposal_reviews enable row level security;
alter table public.revision_runs enable row level security;
alter table public.lessons enable row level security;
create policy "Staff see reviews" on public.proposal_reviews for select to authenticated using ((select private.is_staff()));
create policy "Staff see revision runs" on public.revision_runs for select to authenticated using ((select private.is_staff()));
create policy "Staff see lessons" on public.lessons for select to authenticated using ((select private.is_staff()));

revoke all on function public.record_review(bigint, text, jsonb, text) from public, anon;
revoke all on function public.set_lesson_active(bigint, boolean) from public, anon;
grant execute on function public.record_review(bigint, text, jsonb, text) to authenticated;
grant execute on function public.set_lesson_active(bigint, boolean) to authenticated;
