-- Group 3: T2 Prepare clarification request, the client-reply handoff, the day-2
-- reminder, and the 3-business-day "Stopped – no response" rule.
--   clarification_requests: one row per drafted message (request or reminder).
--   Never: a message is marked sent only after a signed-in employee approved it, and the
--   same request or reminder is never sent twice (CHECK + unique index below).

-- ---------------------------------------------------------------------------
-- Dates: business days in the venue's time zone, skipping the holidays setting.
-- ---------------------------------------------------------------------------
create or replace function private.venue_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Los_Angeles')::date
$$;

create or replace function private.add_business_days(p_start date, p_days integer)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := p_start;
  v_added integer := 0;
  v_holidays date[] := coalesce((select array_agg(value::date) from jsonb_array_elements_text(private.setting('holidays')) as value), '{}');
begin
  while v_added < p_days loop
    v_day := v_day + 1;
    if extract(isodow from v_day) < 6 and not (v_day = any (v_holidays)) then
      v_added := v_added + 1;
    end if;
  end loop;
  return v_day;
end;
$$;

-- 2026-11-11 -> 'Wednesday, November 11, 2026' (the same text the agent writes).
create or replace function private.format_deadline(p_day date)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_day, 'FMDay, FMMonth FMDD, YYYY')
$$;

-- The checks every message must pass before approval (same as the agent's checkDraft).
create or replace function private.clarification_text_problem(p_subject text, p_body text, p_inquiry_id text, p_deadline date)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if position(p_inquiry_id in coalesce(p_subject, '')) = 0 then return 'The subject must include ' || p_inquiry_id || '.'; end if;
  if position(p_inquiry_id in coalesce(p_body, '')) = 0 then return 'The message must include ' || p_inquiry_id || '.'; end if;
  if p_deadline is not null and position(private.format_deadline(p_deadline) in p_body) = 0 then
    return 'The message must keep the reply-by date (' || private.format_deadline(p_deadline) || ').';
  end if;
  if p_body !~* '\mreply\M' then return 'The message must ask the client to reply.'; end if;
  if (p_subject || ' ' || p_body) ~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' then return 'The message contains an email address; remove it.'; end if;
  if (p_subject || ' ' || p_body) ~ '\(?\m\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\M' then return 'The message contains a phone number; remove it.'; end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clarification requests
-- ---------------------------------------------------------------------------
create table public.clarification_requests (
  id bigint generated always as identity primary key,
  inquiry_id text not null references public.inquiries (id) on delete restrict,
  submission_id bigint not null references public.inquiry_submissions (id) on delete restrict,
  kind text not null default 'request' check (kind in ('request', 'reminder')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'superseded', 'sent', 'answered')),
  subject text not null check (length(subject) between 1 and 300),
  body text not null check (length(body) between 1 and 6000),
  issues jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  deadline date,
  reminder_due date,
  drafted_by text not null check (drafted_by in ('ai', 'checklist', 'reminder_template')),
  model text,
  draft_problems text[] not null default '{}',
  redraft_of bigint references public.clarification_requests (id) on delete restrict,
  edited boolean not null default false,
  edited_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users (id) on delete set null,
  rejected_at timestamptz,
  reject_reason text,
  sent_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  -- Never email a client without an employee's permission: a sent message must carry an approval.
  constraint approved_before_sent check (status not in ('approved', 'sent', 'answered') or (approved_by is not null and approved_at is not null)),
  constraint sent_has_time check (status not in ('sent', 'answered') or (sent_by is not null and sent_at is not null)),
  constraint rejection_has_reason check (status <> 'rejected' or length(btrim(coalesce(reject_reason, ''))) >= 3),
  -- Never store client contact details.
  constraint no_email_in_message check ((subject || ' ' || body) !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}'),
  constraint no_phone_in_message check ((subject || ' ' || body) !~ '\(?\m\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\M')
);
comment on table public.clarification_requests is 'One row per drafted message to the client (a clarification request or its one reminder): the text, the questions and the issues they come from, the reply-by date, and who approved, rejected, edited and sent it, and when.';
create index clarification_requests_inquiry_id_idx on public.clarification_requests (inquiry_id);
create index clarification_requests_submission_id_idx on public.clarification_requests (submission_id);
-- Never send the same information twice: at most one approved or sent request, and one
-- reminder, per round of questions (one round per inquiry submission).
create unique index clarification_one_per_round on public.clarification_requests (submission_id, kind)
  where status in ('approved', 'sent', 'answered');

-- ---------------------------------------------------------------------------
-- Employee actions (signed-in staff only), each recorded with who and when.
-- ---------------------------------------------------------------------------

-- Approve a draft, optionally with edited wording. A request's reply-by date is reset to
-- 3 business days from today (and the date in the text updated to match).
create or replace function public.approve_clarification(p_id bigint, p_subject text, p_body text)
returns public.clarification_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.clarification_requests;
  v_deadline date;
  v_reminder date;
  v_subject text := coalesce(p_subject, '');
  v_body text := coalesce(p_body, '');
  v_problem text;
  v_edited boolean;
begin
  if not private.is_staff() then
    raise exception 'Only signed-in staff can approve messages.' using errcode = '42501';
  end if;
  select * into v_row from public.clarification_requests where id = p_id for update;
  if not found then raise exception 'Unknown message.' using errcode = '22023'; end if;
  if v_row.status <> 'draft' then
    raise exception 'Only a draft can be approved (this one is %).', v_row.status using errcode = '22023';
  end if;
  v_edited := v_subject <> v_row.subject or v_body <> v_row.body;

  if v_row.kind = 'request' then
    v_deadline := private.add_business_days(private.venue_today(), 3);
    v_reminder := private.add_business_days(private.venue_today(), 2);
    if v_row.deadline is not null and v_row.deadline <> v_deadline then
      v_body := replace(v_body, private.format_deadline(v_row.deadline), private.format_deadline(v_deadline));
    end if;
  else
    v_deadline := v_row.deadline;
    v_reminder := v_row.reminder_due;
  end if;

  v_problem := private.clarification_text_problem(v_subject, v_body, v_row.inquiry_id, v_deadline);
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;

  update public.clarification_requests
     set status = 'superseded'
   where submission_id = v_row.submission_id and kind = v_row.kind and status = 'draft' and id <> v_row.id;

  update public.clarification_requests
     set status = 'approved', subject = v_subject, body = v_body, deadline = v_deadline, reminder_due = v_reminder,
         approved_by = (select auth.uid()), approved_at = now(),
         edited = v_edited, edited_by = case when v_edited then (select auth.uid()) else null end
   where id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

-- Reject a draft with a reason (kept for the lessons the agent learns in Group 5).
create or replace function public.reject_clarification(p_id bigint, p_reason text)
returns public.clarification_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.clarification_requests;
begin
  if not private.is_staff() then
    raise exception 'Only signed-in staff can reject messages.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Give a reason for rejecting (at least 3 characters).' using errcode = '22023';
  end if;
  update public.clarification_requests
     set status = 'rejected', rejected_by = (select auth.uid()), rejected_at = now(), reject_reason = btrim(p_reason)
   where id = p_id and status = 'draft'
  returning * into v_row;
  if not found then raise exception 'Only a draft can be rejected.' using errcode = '22023'; end if;
  return v_row;
end;
$$;

-- Record that the employee sent an approved message from their own email.
create or replace function public.mark_clarification_sent(p_id bigint)
returns public.clarification_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.clarification_requests;
begin
  if not private.is_staff() then
    raise exception 'Only signed-in staff can mark messages sent.' using errcode = '42501';
  end if;
  update public.clarification_requests
     set status = 'sent', sent_by = (select auth.uid()), sent_at = now()
   where id = p_id and status = 'approved'
  returning * into v_row;
  if not found then raise exception 'Only an approved message can be marked sent.' using errcode = '22023'; end if;
  if v_row.kind = 'request' then
    update public.inquiries set status = 'waiting_for_client', next_step = 'waiting_for_reply' where id = v_row.inquiry_id;
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- The client's reply (called by the agent with the secret key): a new submission under
-- the same inquiry ID. Refused while Paused or when the inquiry isn't waiting for a reply.
-- ---------------------------------------------------------------------------
create or replace function public.add_client_reply(
  p_inquiry_id text,
  p_deidentified_text text,
  p_placeholders_replaced jsonb,
  p_submitted_by uuid,
  p_flags text[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_next integer;
  v_submission_id bigint;
begin
  if coalesce((private.setting('paused'))::boolean, false) then
    raise exception 'The agent is paused.' using errcode = 'P0001';
  end if;
  select status into v_status from public.inquiries where id = p_inquiry_id for update;
  if not found then raise exception 'Unknown inquiry ID.' using errcode = '22023'; end if;
  if v_status <> 'waiting_for_client' then
    raise exception 'This inquiry is not waiting for a client reply (status: %).', v_status using errcode = '22023';
  end if;
  select coalesce(max(submission_number), 0) + 1 into v_next from public.inquiry_submissions where inquiry_id = p_inquiry_id;
  insert into public.inquiry_submissions
    (inquiry_id, submission_number, kind, deidentified_text, placeholders_replaced, extraction_method, extraction_status, submitted_by, flags)
  values
    (p_inquiry_id, v_next, 'client_reply', p_deidentified_text, coalesce(p_placeholders_replaced, '{}'::jsonb), 'claude', 'pending', p_submitted_by, coalesce(p_flags, '{}'))
  returning id into v_submission_id;
  update public.clarification_requests set status = 'answered' where inquiry_id = p_inquiry_id and status = 'sent';
  update public.clarification_requests set status = 'superseded' where inquiry_id = p_inquiry_id and status in ('draft', 'approved');
  update public.inquiries set status = 'in_progress', next_step = 'extracting' where id = p_inquiry_id;
  return v_submission_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The daily clock (Supabase Cron): reminder draft on business day 2, and
-- "Stopped – no response" once the reply-by date has passed with no reply.
-- ---------------------------------------------------------------------------
create or replace function private.run_clarification_clock()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.venue_today();
  r record;
  v_reminders integer := 0;
  v_stopped integer := 0;
begin
  if coalesce((private.setting('paused'))::boolean, false) then
    return 'paused: nothing done';
  end if;
  for r in
    select c.*, i.status as inquiry_status
      from public.clarification_requests c
      join public.inquiries i on i.id = c.inquiry_id
     where c.kind = 'request' and c.status = 'sent' and i.status = 'waiting_for_client'
  loop
    if v_today > r.deadline then
      update public.inquiries set status = 'stopped_no_response', next_step = 'stopped' where id = r.inquiry_id;
      update public.clarification_requests set status = 'superseded'
       where submission_id = r.submission_id and kind = 'reminder' and status in ('draft', 'approved');
      insert into public.coordinator_alerts (inquiry_id, task, problem)
      values (r.inquiry_id, 'T2', 'Stopped – no response: no client reply by ' || private.format_deadline(r.deadline) || '. No client personal information is kept.');
      v_stopped := v_stopped + 1;
    elsif v_today >= r.reminder_due
      and not exists (select 1 from public.clarification_requests x where x.submission_id = r.submission_id and x.kind = 'reminder') then
      insert into public.clarification_requests (inquiry_id, submission_id, kind, subject, body, deadline, reminder_due, drafted_by)
      values (
        r.inquiry_id, r.submission_id, 'reminder',
        'Reminder: ' || r.inquiry_id || ' – details needed for your event proposal',
        'Hello [CLIENT NAME],' || chr(10) || chr(10) ||
        'A quick reminder that we''re waiting on a few details to finish your event proposal. Our earlier message has the questions; please reply to it by '
          || private.format_deadline(r.deadline) || ', keeping ' || r.inquiry_id || ' in the subject line.' || chr(10) || chr(10) ||
        'Thank you,' || chr(10) || '[EMPLOYEE NAME]' || chr(10) || 'Reference: ' || r.inquiry_id,
        r.deadline, r.reminder_due, 'reminder_template');
      insert into public.coordinator_alerts (inquiry_id, task, problem)
      values (r.inquiry_id, 'T2', 'No reply yet: a reminder is ready for an employee to approve and send.');
      v_reminders := v_reminders + 1;
    end if;
  end loop;
  return v_reminders || ' reminder(s) drafted, ' || v_stopped || ' inquiry(ies) stopped';
end;
$$;

create extension if not exists pg_cron;
select cron.schedule('clarification-clock', '0 16 * * *', 'select private.run_clarification_clock()');

-- ---------------------------------------------------------------------------
-- Grants and row-level security
-- ---------------------------------------------------------------------------
revoke all on public.clarification_requests from anon, authenticated;
revoke all on function public.approve_clarification(bigint, text, text) from public, anon;
revoke all on function public.reject_clarification(bigint, text) from public, anon;
revoke all on function public.mark_clarification_sent(bigint) from public, anon;
revoke all on function public.add_client_reply(text, text, jsonb, uuid, text[]) from public, anon, authenticated;
revoke all on function private.run_clarification_clock() from public, anon, authenticated;
revoke all on function private.add_business_days(date, integer) from public, anon, authenticated;
revoke all on function private.venue_today() from public, anon, authenticated;
revoke all on function private.format_deadline(date) from public, anon, authenticated;
revoke all on function private.clarification_text_problem(text, text, text, date) from public, anon, authenticated;

grant select on public.clarification_requests to authenticated;
grant execute on function public.approve_clarification(bigint, text, text) to authenticated;
grant execute on function public.reject_clarification(bigint, text) to authenticated;
grant execute on function public.mark_clarification_sent(bigint) to authenticated;

grant all on public.clarification_requests to service_role;
grant execute on function public.add_client_reply(text, text, jsonb, uuid, text[]) to service_role;
grant execute on function private.run_clarification_clock() to service_role;
grant execute on function private.add_business_days(date, integer) to service_role;
grant execute on function private.venue_today() to service_role;
grant execute on function private.format_deadline(date) to service_role;

alter table public.clarification_requests enable row level security;
create policy "Staff see clarification requests" on public.clarification_requests
  for select to authenticated using ((select private.is_staff()));
