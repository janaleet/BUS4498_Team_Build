-- Group 6: Gmail, Google Calendar and Google Sheets.
--   emails:        one row per message the agent emails to an employee (never to a client):
--                  an approved clarification request or reminder, or a released proposal.
--   reserve_email(): the only way the agent may email: checks the approval or release click,
--                  that the recipient is staff, the daily limit, and that it wasn't emailed already.
--   materials_log: one row per released proposal written to the Google Sheets materials log.
--   google_files:  the log sheet the agent created (drive.file scope: only its own files).
--   setup_assessments: the Google Calendar availability result.
--   settings:      venue_calendar_id (text) and email_daily_limit (number).
-- Never: email without an employee's approval or release click; email the same message twice;
-- email anyone who isn't staff; store an email address for a client.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
alter table public.settings drop constraint settings_key_check;
alter table public.settings add constraint settings_key_check
  check (key in ('paused', 'ai_daily_run_limit', 'test_runs_per_day', 'holidays', 'venue_calendar_id', 'email_daily_limit'));
alter table public.settings drop constraint settings_kind_check;
alter table public.settings add constraint settings_kind_check check (kind in ('switch', 'number', 'date_list', 'text'));
alter table public.settings drop constraint settings_value_matches_kind;
alter table public.settings add constraint settings_value_matches_kind check (
  (kind = 'switch' and jsonb_typeof(value) = 'boolean')
  or (kind = 'number' and jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 1000)
  or (kind = 'date_list' and jsonb_typeof(value) = 'array')
  or (kind = 'text' and jsonb_typeof(value) = 'string' and length(value #>> '{}') <= 200)
);

insert into public.settings (key, label, kind, value, reason) values
  ('venue_calendar_id', 'Venue Google Calendar ID (Task 3 checks it for bookings)', 'text', '""', 'Not set yet. Add the calendar ID from Google Calendar → Settings → Integrate calendar.'),
  ('email_daily_limit', 'Most emails the agent sends per day (to employees only)', 'number', '20', 'Limit from the Group 6 tool plan.')
on conflict (key) do nothing;

-- Text settings: the calendar ID must look like a Google Calendar ID (or be empty).
create or replace function private.check_text_setting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key = 'venue_calendar_id' and (new.value #>> '{}') <> ''
     and (new.value #>> '{}') !~ '^[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$' then
    raise exception 'A calendar ID looks like name@group.calendar.google.com or an address@gmail.com.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger settings_text_check before insert or update on public.settings
  for each row execute function private.check_text_setting();

-- ---------------------------------------------------------------------------
-- Calendar availability on the setup assessment
-- ---------------------------------------------------------------------------
alter table public.setup_assessments
  add column availability text not null default 'not_checked'
    check (availability in ('free', 'booked', 'not_checked', 'not_configured')),
  add column availability_note text not null default '';

-- ---------------------------------------------------------------------------
-- Emails to employees
-- ---------------------------------------------------------------------------
create table public.emails (
  id bigint generated always as identity primary key,
  inquiry_id text not null references public.inquiries (id) on delete restrict,
  kind text not null check (kind in ('clarification_request', 'reminder', 'proposal')),
  source_id bigint not null,
  to_user uuid not null references auth.users (id) on delete restrict,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  gmail_message_id text,
  error text,
  requested_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint sent_has_id check (status <> 'sent' or (gmail_message_id is not null and sent_at is not null))
);
comment on table public.emails is 'One row per message the agent emailed to an employee''s own inbox (never to a client): an approved clarification request or reminder, or a released proposal. The employee forwards it. No email address is stored.';
create index emails_inquiry_id_idx on public.emails (inquiry_id);
-- Never send the same message twice.
create unique index emails_once on public.emails (kind, source_id) where status in ('sending', 'sent');

-- The agent calls this (with the secret key) before every send. Returns the new row's id.
create or replace function public.reserve_email(p_kind text, p_source_id bigint, p_to_user uuid, p_requested_by uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiry text;
  v_ok boolean;
  v_id bigint;
  v_limit numeric := coalesce((private.setting('email_daily_limit') #>> '{}')::numeric, 0);
begin
  if coalesce((private.setting('paused'))::boolean, false) then
    raise exception 'The agent is paused.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.staff_members where user_id = p_to_user) then
    raise exception 'Emails go only to staff members.' using errcode = '42501';
  end if;
  if p_kind in ('clarification_request', 'reminder') then
    select inquiry_id, (status in ('approved', 'sent', 'answered') and approved_by is not null)
      into v_inquiry, v_ok
      from public.clarification_requests
     where id = p_source_id and kind = case p_kind when 'reminder' then 'reminder' else 'request' end;
    if not found or not v_ok then
      raise exception 'Only an approved message can be emailed.' using errcode = '22023';
    end if;
  elsif p_kind = 'proposal' then
    select inquiry_id, (status = 'released' and released_by is not null) into v_inquiry, v_ok from public.proposals where id = p_source_id;
    if not found or not v_ok then
      raise exception 'Only a released proposal can be emailed.' using errcode = '22023';
    end if;
  else
    raise exception 'Unknown kind of email.' using errcode = '22023';
  end if;
  if (select count(*) from public.emails
       where status in ('sending', 'sent') and (created_at at time zone 'America/Los_Angeles')::date = private.venue_today()) >= v_limit then
    raise exception 'The daily email limit (%) is reached.', v_limit using errcode = 'P0001';
  end if;
  insert into public.emails (inquiry_id, kind, source_id, to_user, requested_by)
  values (v_inquiry, p_kind, p_source_id, p_to_user, p_requested_by)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'This message has already been emailed.' using errcode = '23505';
end;
$$;

-- ---------------------------------------------------------------------------
-- Materials log (Google Sheets) and the agent's own Google files
-- ---------------------------------------------------------------------------
create table public.google_files (
  key text primary key check (key in ('materials_log')),
  file_id text not null,
  url text not null,
  created_at timestamptz not null default now()
);
comment on table public.google_files is 'Google files the agent created and may use (drive.file scope): the materials log sheet.';

create table public.materials_log (
  id bigint generated always as identity primary key,
  inquiry_id text not null references public.inquiries (id) on delete restrict,
  proposal_id bigint not null references public.proposals (id) on delete restrict,
  status text not null default 'writing' check (status in ('writing', 'written', 'failed')),
  row_values jsonb not null,
  updated_range text,
  error text,
  created_at timestamptz not null default now(),
  constraint no_email_in_row check (row_values::text !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}'),
  constraint no_phone_in_row check (row_values::text !~ '\(?\m\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\M')
);
comment on table public.materials_log is 'One row per released proposal written to the Google Sheets materials log: event date, inquiry ID, room, layout, guests, tables, chairs, AV. No client details.';
-- One row per inquiry.
create unique index materials_log_once on public.materials_log (inquiry_id) where status in ('writing', 'written');

-- ---------------------------------------------------------------------------
-- Grants and row-level security
-- ---------------------------------------------------------------------------
revoke all on public.emails, public.google_files, public.materials_log from anon, authenticated;
grant select on public.emails, public.google_files, public.materials_log to authenticated;
grant all on public.emails, public.google_files, public.materials_log to service_role;
alter table public.emails enable row level security;
alter table public.google_files enable row level security;
alter table public.materials_log enable row level security;
create policy "Staff see emails" on public.emails for select to authenticated using ((select private.is_staff()));
create policy "Staff see Google files" on public.google_files for select to authenticated using ((select private.is_staff()));
create policy "Staff see the materials log" on public.materials_log for select to authenticated using ((select private.is_staff()));

revoke all on function public.reserve_email(text, bigint, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_email(text, bigint, uuid, uuid) to service_role;
revoke all on function private.check_text_setting() from public, anon, authenticated;
