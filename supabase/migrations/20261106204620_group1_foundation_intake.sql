-- Group 1: foundation and inquiry intake.
--   Foundation: staff sign-in, settings a reviewer may change (Paused, daily AI limit,
--   test runs per day, holidays), problem reports, coordinator alerts, AI usage.
--   Intake: T1 Review supplied event details + D1 Sufficient event details?
-- Never stores client names, emails, phone numbers, or addresses: only text that has
-- already passed through remove_personal_details is saved, and CHECK rules refuse
-- text that still contains an email address or phone number.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Staff: one row per person who may sign in. Both teammates can do every role.
-- ---------------------------------------------------------------------------
create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.staff_members is 'One row per staff member allowed to use the app. Every staff member can review, approve, coordinate and send. Added by the owner in the SQL Editor.';
create unique index staff_members_one_owner on public.staff_members (is_owner) where is_owner;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_members where user_id = (select auth.uid()))
$$;

-- ---------------------------------------------------------------------------
-- Settings: switches and limits a signed-in reviewer may change, with a reason.
-- The agent reads them on every run, so a change needs no redeploy.
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key check (key in ('paused', 'ai_daily_run_limit', 'test_runs_per_day', 'holidays')),
  label text not null,
  kind text not null check (kind in ('switch', 'number', 'date_list')),
  value jsonb not null,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint settings_value_matches_kind check (
    (kind = 'switch' and jsonb_typeof(value) = 'boolean')
    or (kind = 'number' and jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 1000)
    or (kind = 'date_list' and jsonb_typeof(value) = 'array')
  )
);
comment on table public.settings is 'One row per switch or limit a reviewer may change. The agent reads every row on each run.';

create table public.settings_history (
  id bigint generated always as identity primary key,
  key text not null references public.settings (key) on delete restrict,
  old_value jsonb,
  new_value jsonb not null,
  reason text not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
comment on table public.settings_history is 'One row per change to a setting: old and new value, reason, who and when.';

insert into public.settings (key, label, kind, value, reason) values
  ('paused', 'Paused (off switch): the agent does nothing and calls no AI', 'switch', 'false', 'Starts off. A reviewer can pause the agent at any time.'),
  ('ai_daily_run_limit', 'Most AI calls per day (all tasks, including test mode)', 'number', '100', 'Spending limit from the Group 1 plan.'),
  ('test_runs_per_day', 'Most test-mode (dry run) AI calls per day', 'number', '50', 'Keeps test buttons from using the whole daily limit.'),
  ('holidays', 'Holidays skipped when counting business days', 'date_list', '[]', 'No holidays given yet; reviewers add them.');

-- The only way to change a setting: signed-in staff, with a reason, recorded in history.
create or replace function public.change_setting(p_key text, p_value jsonb, p_reason text)
returns public.settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.settings;
  v_new public.settings;
  v_item jsonb;
begin
  if not private.is_staff() then
    raise exception 'Only signed-in staff can change settings.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Give a reason for the change (at least 3 characters).' using errcode = '22023';
  end if;
  select * into v_old from public.settings where key = p_key for update;
  if not found then
    raise exception 'Unknown setting %.', p_key using errcode = '22023';
  end if;
  if v_old.kind = 'date_list' then
    if jsonb_typeof(p_value) <> 'array' then
      raise exception 'Holidays must be a list of dates.' using errcode = '22023';
    end if;
    for v_item in select * from jsonb_array_elements(p_value) loop
      if jsonb_typeof(v_item) <> 'string' or (v_item #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Each holiday must be a date written YYYY-MM-DD.' using errcode = '22023';
      end if;
      perform (v_item #>> '{}')::date;
    end loop;
  end if;

  update public.settings
     set value = p_value, reason = btrim(p_reason), changed_by = (select auth.uid()), changed_at = now()
   where key = p_key
  returning * into v_new;

  insert into public.settings_history (key, old_value, new_value, reason, changed_by)
  values (p_key, v_old.value, p_value, btrim(p_reason), (select auth.uid()));
  return v_new;
end;
$$;

create or replace function private.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.settings where key = p_key
$$;

-- ---------------------------------------------------------------------------
-- Inquiries (what happened): one row per client inquiry, filed under its ID.
-- ---------------------------------------------------------------------------
create sequence public.inquiry_number_seq;

create table public.inquiries (
  id text primary key default ('INQ-' || lpad(nextval('public.inquiry_number_seq')::text, 4, '0')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'waiting_for_client', 'ready', 'stopped_no_response', 'stopped_coordinator_review')),
  next_step text not null default 'extracting',
  d1_result text check (d1_result in ('sufficient', 'missing')),
  revision_round integer not null default 0 check (revision_round between 0 and 3),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.inquiries is 'One row per client inquiry, filed under its inquiry ID, with where it stands. Never expires.';
comment on column public.inquiries.next_step is 'extracting, enter_details_by_hand, t2_clarification, or t3_setup_needs (later groups add more).';

create table public.inquiry_submissions (
  id bigint generated always as identity primary key,
  inquiry_id text not null references public.inquiries (id) on delete restrict,
  submission_number integer not null check (submission_number >= 1),
  kind text not null default 'original' check (kind in ('original', 'client_reply')),
  deidentified_text text not null check (length(deidentified_text) between 1 and 20000),
  placeholders_replaced jsonb not null default '{}'::jsonb,
  extraction_method text not null check (extraction_method in ('claude', 'by_hand')),
  extraction_status text not null check (extraction_status in ('pending', 'succeeded', 'failed', 'entered_by_hand')),
  extraction_error text,
  model text,
  fields jsonb not null default '{}'::jsonb,
  d1_result text check (d1_result in ('sufficient', 'missing')),
  missing_fields text[] not null default '{}',
  flags text[] not null default '{}',
  checked text[] not null default '{}',
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inquiry_id, submission_number),
  -- Never: store a client email address or phone number (database rule behind the code check).
  constraint no_email_in_text check (deidentified_text !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}'),
  constraint no_phone_in_text check (deidentified_text !~ '\(?\m\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\M'),
  constraint no_email_in_fields check (fields::text !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}')
);
comment on table public.inquiry_submissions is 'One row per pass through Task 1: the de-identified text, the six required details with status and supporting sentence, flags for a person, and what the agent checked.';
comment on column public.inquiry_submissions.flags is 'Text in the inquiry that looked like instructions to the agent. Shown to a person; never followed.';
comment on column public.inquiry_submissions.checked is 'What the agent looked at for this decision (settings, rules, model), shown to the reviewer.';
create index inquiry_submissions_inquiry_id_idx on public.inquiry_submissions (inquiry_id);

-- ---------------------------------------------------------------------------
-- Coordinator alerts, problem reports, AI usage
-- ---------------------------------------------------------------------------
create table public.coordinator_alerts (
  id bigint generated always as identity primary key,
  inquiry_id text references public.inquiries (id) on delete restrict,
  task text not null,
  problem text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);
comment on table public.coordinator_alerts is 'One row per problem the event coordinator must handle. Any staff member can see them.';
create index coordinator_alerts_inquiry_id_idx on public.coordinator_alerts (inquiry_id);

create table public.problem_reports (
  id bigint generated always as identity primary key,
  inquiry_id text references public.inquiries (id) on delete restrict,
  about text not null check (length(btrim(about)) between 1 and 80),
  note text not null check (length(btrim(note)) between 3 and 2000),
  reported_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);
comment on table public.problem_reports is 'One row per "Report a problem" click: which decision, a note, who and when. Never changes a decision or a switch by itself.';
create index problem_reports_inquiry_id_idx on public.problem_reports (inquiry_id);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  used_on date not null default (now() at time zone 'America/Los_Angeles')::date,
  task text not null,
  inquiry_id text references public.inquiries (id) on delete set null,
  model text not null,
  dry_run boolean not null default false,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
comment on table public.ai_usage is 'One row per AI call (including test mode), used to enforce the daily limits and count tokens.';
create index ai_usage_used_on_idx on public.ai_usage (used_on);
create index ai_usage_inquiry_id_idx on public.ai_usage (inquiry_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger inquiries_touch before update on public.inquiries
  for each row execute function private.touch_updated_at();
create trigger inquiry_submissions_touch before update on public.inquiry_submissions
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Database functions only the Edge Function (secret key) may call
-- ---------------------------------------------------------------------------

-- Create an inquiry and its first submission together. Refused while Paused.
create or replace function public.start_inquiry(
  p_deidentified_text text,
  p_placeholders_replaced jsonb,
  p_extraction_method text,
  p_submitted_by uuid,
  p_flags text[]
)
returns table (inquiry_id text, submission_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiry_id text;
  v_submission_id bigint;
begin
  if coalesce((private.setting('paused'))::boolean, false) then
    raise exception 'The agent is paused.' using errcode = 'P0001';
  end if;

  insert into public.inquiries (created_by, next_step)
  values (p_submitted_by, case when p_extraction_method = 'by_hand' then 'enter_details_by_hand' else 'extracting' end)
  returning id into v_inquiry_id;

  insert into public.inquiry_submissions
    (inquiry_id, submission_number, kind, deidentified_text, placeholders_replaced,
     extraction_method, extraction_status, submitted_by, flags)
  values
    (v_inquiry_id, 1, 'original', p_deidentified_text, coalesce(p_placeholders_replaced, '{}'::jsonb),
     p_extraction_method, 'pending', p_submitted_by, coalesce(p_flags, '{}'))
  returning id into v_submission_id;

  return query select v_inquiry_id, v_submission_id;
end;
$$;

-- Reserve one AI call. Returns the usage row id, or null when Paused or a daily limit
-- is reached. Limits come from the settings table, never from the caller.
create or replace function public.reserve_ai_call(p_task text, p_inquiry_id text, p_model text, p_dry_run boolean)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Los_Angeles')::date;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage_daily_limit'));
  if coalesce((private.setting('paused'))::boolean, false) then
    return null;
  end if;
  if (select count(*) from public.ai_usage where used_on = v_today)
     >= coalesce((private.setting('ai_daily_run_limit') #>> '{}')::numeric, 0) then
    return null;
  end if;
  if p_dry_run and (select count(*) from public.ai_usage where used_on = v_today and dry_run)
     >= coalesce((private.setting('test_runs_per_day') #>> '{}')::numeric, 0) then
    return null;
  end if;
  insert into public.ai_usage (used_on, task, inquiry_id, model, dry_run)
  values (v_today, p_task, p_inquiry_id, p_model, coalesce(p_dry_run, false))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: start from nothing, then allow exactly what each role needs.
-- The website (authenticated) reads through row-level security and may only
-- insert a problem report or change a setting through change_setting.
-- ---------------------------------------------------------------------------
revoke all on public.staff_members, public.settings, public.settings_history, public.inquiries,
  public.inquiry_submissions, public.coordinator_alerts, public.problem_reports, public.ai_usage
  from anon, authenticated;
revoke all on sequence public.inquiry_number_seq from anon, authenticated;
revoke all on function public.start_inquiry(text, jsonb, text, uuid, text[]) from public, anon, authenticated;
revoke all on function public.reserve_ai_call(text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.change_setting(text, jsonb, text) from public, anon;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.is_staff() from public, anon;
revoke all on function private.setting(text) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function public.change_setting(text, jsonb, text) to authenticated;

grant select on public.staff_members, public.settings, public.settings_history, public.inquiries,
  public.inquiry_submissions, public.coordinator_alerts, public.problem_reports to authenticated;
grant insert (inquiry_id, about, note) on public.problem_reports to authenticated;

grant all on public.staff_members, public.settings, public.settings_history, public.inquiries,
  public.inquiry_submissions, public.coordinator_alerts, public.problem_reports, public.ai_usage to service_role;
grant usage, select on sequence public.inquiry_number_seq to service_role;
grant usage on schema private to service_role;
grant execute on function public.start_inquiry(text, jsonb, text, uuid, text[]) to service_role;
grant execute on function public.reserve_ai_call(text, text, text, boolean) to service_role;
grant execute on function private.setting(text) to service_role;
grant execute on function private.is_staff() to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.staff_members enable row level security;
alter table public.settings enable row level security;
alter table public.settings_history enable row level security;
alter table public.inquiries enable row level security;
alter table public.inquiry_submissions enable row level security;
alter table public.coordinator_alerts enable row level security;
alter table public.problem_reports enable row level security;
alter table public.ai_usage enable row level security;

create policy "Staff see staff" on public.staff_members
  for select to authenticated using ((select private.is_staff()));
create policy "Staff see settings" on public.settings
  for select to authenticated using ((select private.is_staff()));
create policy "Staff see setting changes" on public.settings_history
  for select to authenticated using ((select private.is_staff()));
create policy "Staff see inquiries" on public.inquiries
  for select to authenticated using ((select private.is_staff()));
create policy "Staff see submissions" on public.inquiry_submissions
  for select to authenticated using ((select private.is_staff()));
create policy "Staff see alerts" on public.coordinator_alerts
  for select to authenticated using ((select private.is_staff()));
create policy "Staff see problem reports" on public.problem_reports
  for select to authenticated using ((select private.is_staff()));
create policy "Staff report problems as themselves" on public.problem_reports
  for insert to authenticated
  with check ((select private.is_staff()) and reported_by = (select auth.uid()));

-- ai_usage has no policies: the website can never read or change it.
