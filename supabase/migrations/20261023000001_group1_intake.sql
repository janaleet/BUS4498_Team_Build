-- Group 1: sign-in roles and inquiry intake (T1 Review supplied event details + D1)
-- Never stores client names, emails, phone numbers, or addresses: only text that
-- has already passed through remove_personal_details is saved.

-- ---------------------------------------------------------------------------
-- Staff and roles
-- ---------------------------------------------------------------------------
create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('employee', 'reviewer', 'coordinator')),
  created_at timestamptz not null default now()
);
comment on table public.staff_members is 'One row per signed-in staff member and their role. Roles are set by the project owner.';

-- Helper used by the security rules: the signed-in person's role, or null.
create schema if not exists private;
create or replace function private.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.staff_members where user_id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Inquiries
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
comment on table public.inquiries is 'One row per client inquiry, filed under its inquiry ID, with where it stands.';
comment on column public.inquiries.next_step is 'extracting, enter_details_by_hand, t2_clarification, or t3_setup_needs (later groups add more).';

create table public.inquiry_submissions (
  id bigint generated always as identity primary key,
  inquiry_id text not null references public.inquiries (id) on delete restrict,
  submission_number integer not null,
  kind text not null default 'original' check (kind in ('original', 'client_reply')),
  deidentified_text text not null,
  placeholders_replaced jsonb not null default '{}'::jsonb,
  extraction_method text not null check (extraction_method in ('claude', 'by_hand')),
  extraction_status text not null check (extraction_status in ('pending', 'succeeded', 'failed', 'entered_by_hand')),
  extraction_error text,
  model text,
  fields jsonb not null default '{}'::jsonb,
  d1_result text check (d1_result in ('sufficient', 'missing')),
  missing_fields text[] not null default '{}',
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inquiry_id, submission_number)
);
comment on table public.inquiry_submissions is 'One row per pass through Task 1: the de-identified text and the six required details with their status and supporting sentence.';

create index inquiry_submissions_inquiry_id_idx on public.inquiry_submissions (inquiry_id);

-- ---------------------------------------------------------------------------
-- Coordinator alerts and AI usage
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
comment on table public.coordinator_alerts is 'One row per problem the event coordinator must handle.';
create index coordinator_alerts_inquiry_id_idx on public.coordinator_alerts (inquiry_id);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  used_on date not null default (now() at time zone 'America/Los_Angeles')::date,
  task text not null,
  inquiry_id text references public.inquiries (id) on delete set null,
  model text not null,
  created_at timestamptz not null default now()
);
comment on table public.ai_usage is 'One row per call to Claude, used to enforce the daily spending limit.';
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

-- Create an inquiry and its first submission together, so neither exists alone.
create or replace function public.start_inquiry(
  p_deidentified_text text,
  p_placeholders_replaced jsonb,
  p_extraction_method text,
  p_submitted_by uuid
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
  insert into public.inquiries (created_by, next_step)
  values (p_submitted_by, case when p_extraction_method = 'by_hand' then 'enter_details_by_hand' else 'extracting' end)
  returning id into v_inquiry_id;

  insert into public.inquiry_submissions
    (inquiry_id, submission_number, kind, deidentified_text, placeholders_replaced,
     extraction_method, extraction_status, submitted_by)
  values
    (v_inquiry_id, 1, 'original', p_deidentified_text, coalesce(p_placeholders_replaced, '{}'::jsonb),
     p_extraction_method, 'pending', p_submitted_by)
  returning id into v_submission_id;

  return query select v_inquiry_id, v_submission_id;
end;
$$;

-- Reserve one Claude call if today's count is under the limit. Returns false at the limit.
create or replace function public.reserve_ai_call(p_task text, p_inquiry_id text, p_model text, p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage_daily_limit'));
  if (select count(*) from public.ai_usage where used_on = v_today) >= p_daily_limit then
    return false;
  end if;
  insert into public.ai_usage (used_on, task, inquiry_id, model) values (v_today, p_task, p_inquiry_id, p_model);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the website (anon, authenticated) gets read access only, and only
-- through row-level security. All writes go through the Edge Function.
-- ---------------------------------------------------------------------------
revoke all on public.staff_members, public.inquiries, public.inquiry_submissions,
  public.coordinator_alerts, public.ai_usage from anon, authenticated;
revoke all on sequence public.inquiry_number_seq from anon, authenticated;
revoke all on function public.start_inquiry(text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.reserve_ai_call(text, text, text, integer) from public, anon, authenticated;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

grant select on public.staff_members, public.inquiries, public.inquiry_submissions,
  public.coordinator_alerts to authenticated;

grant usage on schema private to authenticated;
revoke all on function private.staff_role() from public, anon;
grant execute on function private.staff_role() to authenticated;

grant all on public.staff_members, public.inquiries, public.inquiry_submissions,
  public.coordinator_alerts, public.ai_usage to service_role;
grant usage, select on sequence public.inquiry_number_seq to service_role;
grant usage on schema private to service_role;
grant execute on function public.start_inquiry(text, jsonb, text, uuid) to service_role;
grant execute on function public.reserve_ai_call(text, text, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.staff_members enable row level security;
alter table public.inquiries enable row level security;
alter table public.inquiry_submissions enable row level security;
alter table public.coordinator_alerts enable row level security;
alter table public.ai_usage enable row level security;

create policy "Staff see their own staff row"
  on public.staff_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Staff see all inquiries"
  on public.inquiries for select to authenticated
  using ((select private.staff_role()) is not null);

create policy "Staff see all submissions"
  on public.inquiry_submissions for select to authenticated
  using ((select private.staff_role()) is not null);

create policy "Coordinator sees alerts"
  on public.coordinator_alerts for select to authenticated
  using ((select private.staff_role()) = 'coordinator');

-- ai_usage has no policies: the website can never read or change it.
