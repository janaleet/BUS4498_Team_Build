-- Group 2: T3 Identify event setup needs + D2 Use template?
--   rooms: the inventory (memory plan item 2), kept current by staff; starts with the
--          example rooms from our_team_agent/docs/rooms-and-equipment.csv.
--   room_changes: who changed a room, when, and why.
--   setup_assessments: one T3 assessment and D2 route per inquiry submission.

create table public.rooms (
  name text primary key check (length(btrim(name)) between 1 and 80),
  theater_capacity integer not null default 0 check (theater_capacity between 0 and 10000),
  classroom_capacity integer not null default 0 check (classroom_capacity between 0 and 10000),
  banquet_capacity integer not null default 0 check (banquet_capacity between 0 and 10000),
  reception_capacity integer not null default 0 check (reception_capacity between 0 and 10000),
  boardroom_capacity integer not null default 0 check (boardroom_capacity between 0 and 10000),
  six_ft_tables integer not null default 0 check (six_ft_tables between 0 and 10000),
  round_tables_60in integer not null default 0 check (round_tables_60in between 0 and 10000),
  cocktail_tables integer not null default 0 check (cocktail_tables between 0 and 10000),
  chairs integer not null default 0 check (chairs between 0 and 10000),
  projectors integer not null default 0 check (projectors between 0 and 100),
  screens_or_displays integer not null default 0 check (screens_or_displays between 0 and 100),
  wireless_mics integer not null default 0 check (wireless_mics between 0 and 100),
  speaker_system boolean not null default false,
  video_conferencing boolean not null default false,
  notes text not null default '' check (length(notes) <= 500),
  active boolean not null default true,
  is_example boolean not null default true,
  reason text not null default 'Example room from rooms-and-equipment.csv' check (length(btrim(reason)) between 3 and 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.rooms is 'One row per room: capacity by layout (0 = layout not offered), tables, chairs and AV on hand. Staff keep it current; the agent reads the active rooms on every run. Rooms are switched off, never deleted.';

create table public.room_changes (
  id bigint generated always as identity primary key,
  room text not null references public.rooms (name) on delete restrict,
  old_row jsonb,
  new_row jsonb not null,
  reason text not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
comment on table public.room_changes is 'One row per change to a room: before, after, reason, who and when.';

insert into public.rooms (name, theater_capacity, classroom_capacity, banquet_capacity, reception_capacity, boardroom_capacity,
  six_ft_tables, round_tables_60in, cocktail_tables, chairs, projectors, screens_or_displays, wireless_mics,
  speaker_system, video_conferencing, notes) values
  ('Executive Boardroom', 0, 0, 0, 0, 20, 0, 0, 0, 20, 0, 1, 0, false, true, 'Fixed boardroom table; 75-inch display'),
  ('Studio A', 50, 24, 32, 60, 16, 14, 4, 6, 55, 1, 1, 1, true, false, 'Small meeting and social room'),
  ('Garden Room', 120, 60, 96, 150, 0, 30, 12, 15, 130, 1, 1, 2, true, false, 'Opens onto the Terrace'),
  ('Terrace', 80, 0, 64, 100, 0, 10, 8, 12, 90, 0, 0, 1, true, false, 'Outdoor; Garden Room is the weather backup'),
  ('Grand Ballroom', 300, 160, 240, 350, 0, 60, 30, 35, 320, 2, 2, 4, true, true, 'Portable stage and dance floor available as special requests');

-- The only way to add or change a room: signed-in staff, with a reason, recorded in room_changes.
create or replace function public.save_room(p_room jsonb, p_reason text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_room ->> 'name', ''));
  v_old public.rooms;
  v_new public.rooms;
  v_key text;
begin
  if not private.is_staff() then
    raise exception 'Only signed-in staff can change rooms.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Give a reason for the change (at least 3 characters).' using errcode = '22023';
  end if;
  if v_name = '' then
    raise exception 'The room needs a name.' using errcode = '22023';
  end if;
  foreach v_key in array array['theater_capacity', 'classroom_capacity', 'banquet_capacity', 'reception_capacity', 'boardroom_capacity',
    'six_ft_tables', 'round_tables_60in', 'cocktail_tables', 'chairs', 'projectors', 'screens_or_displays', 'wireless_mics'] loop
    if (p_room ->> v_key) is null or (p_room ->> v_key) !~ '^\d{1,5}$' then
      raise exception '% must be a whole number.', replace(v_key, '_', ' ') using errcode = '22023';
    end if;
  end loop;

  select * into v_old from public.rooms where name = v_name for update;

  insert into public.rooms as r (name, theater_capacity, classroom_capacity, banquet_capacity, reception_capacity, boardroom_capacity,
    six_ft_tables, round_tables_60in, cocktail_tables, chairs, projectors, screens_or_displays, wireless_mics,
    speaker_system, video_conferencing, notes, active, is_example, reason, updated_by, updated_at)
  values (v_name,
    (p_room ->> 'theater_capacity')::int, (p_room ->> 'classroom_capacity')::int, (p_room ->> 'banquet_capacity')::int,
    (p_room ->> 'reception_capacity')::int, (p_room ->> 'boardroom_capacity')::int,
    (p_room ->> 'six_ft_tables')::int, (p_room ->> 'round_tables_60in')::int, (p_room ->> 'cocktail_tables')::int,
    (p_room ->> 'chairs')::int, (p_room ->> 'projectors')::int, (p_room ->> 'screens_or_displays')::int, (p_room ->> 'wireless_mics')::int,
    coalesce((p_room ->> 'speaker_system')::boolean, false), coalesce((p_room ->> 'video_conferencing')::boolean, false),
    coalesce(p_room ->> 'notes', ''), coalesce((p_room ->> 'active')::boolean, true), false,
    btrim(p_reason), (select auth.uid()), now())
  on conflict (name) do update set
    theater_capacity = excluded.theater_capacity, classroom_capacity = excluded.classroom_capacity,
    banquet_capacity = excluded.banquet_capacity, reception_capacity = excluded.reception_capacity,
    boardroom_capacity = excluded.boardroom_capacity, six_ft_tables = excluded.six_ft_tables,
    round_tables_60in = excluded.round_tables_60in, cocktail_tables = excluded.cocktail_tables, chairs = excluded.chairs,
    projectors = excluded.projectors, screens_or_displays = excluded.screens_or_displays, wireless_mics = excluded.wireless_mics,
    speaker_system = excluded.speaker_system, video_conferencing = excluded.video_conferencing, notes = excluded.notes,
    active = excluded.active, is_example = false, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into public.room_changes (room, old_row, new_row, reason, changed_by)
  values (v_name, case when v_old.name is null then null else to_jsonb(v_old) end, to_jsonb(v_new), btrim(p_reason), (select auth.uid()));
  return v_new;
end;
$$;

-- One T3 assessment and D2 route per submission (never twice for the same pass).
create table public.setup_assessments (
  id bigint generated always as identity primary key,
  inquiry_id text not null references public.inquiries (id) on delete restrict,
  submission_id bigint not null unique references public.inquiry_submissions (id) on delete restrict,
  event_type text not null,
  guest_count integer not null check (guest_count > 0),
  layout text not null check (layout in ('theater', 'classroom', 'banquet', 'reception', 'boardroom')),
  room text references public.rooms (name) on delete restrict,
  room_capacity integer,
  tables jsonb not null default '[]'::jsonb,
  chairs jsonb,
  av jsonb not null default '[]'::jsonb,
  setup_teardown jsonb,
  unresolved text[] not null default '{}',
  assumptions text[] not null default '{}',
  shortages text[] not null default '{}',
  questions text[] not null default '{}',
  on_template_list boolean not null,
  fits_standard_layout boolean not null,
  special_requests text[] not null default '{}',
  special_requests_checked boolean not null,
  route text not null check (route in ('template', 'tailored', 'clarify', 'held')),
  model text,
  checked text[] not null default '{}',
  created_at timestamptz not null default now(),
  -- A room must be named unless the route is a clarification request.
  constraint room_named_unless_clarify check (room is not null or route = 'clarify')
);
comment on table public.setup_assessments is 'One row per T3 assessment: recommended room, tables, chairs, AV (needed / not needed / unknown with source), unresolved questions, assumptions, the three D2 checks, and the route (template, tailored, clarify, held).';
create index setup_assessments_inquiry_id_idx on public.setup_assessments (inquiry_id);

-- Grants: start from nothing.
revoke all on public.rooms, public.room_changes, public.setup_assessments from anon, authenticated;
revoke all on function public.save_room(jsonb, text) from public, anon;
grant execute on function public.save_room(jsonb, text) to authenticated;
grant select on public.rooms, public.room_changes, public.setup_assessments to authenticated;
grant all on public.rooms, public.room_changes, public.setup_assessments to service_role;

alter table public.rooms enable row level security;
alter table public.room_changes enable row level security;
alter table public.setup_assessments enable row level security;

create policy "Staff see rooms" on public.rooms
  for select to authenticated using ((select private.is_staff()));
create policy "Staff see room changes" on public.room_changes
  for select to authenticated using ((select private.is_staff()));
create policy "Staff see setup assessments" on public.setup_assessments
  for select to authenticated using ((select private.is_staff()));
