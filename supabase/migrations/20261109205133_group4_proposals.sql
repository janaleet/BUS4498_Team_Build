-- Group 4: T4 Prepare template proposal + T5 Prepare tailored proposal.
--   proposals: one row per proposal draft (versioned), with the text placed in each template
--              section, the departures from the standard template with the D2 reason for each
--              (for the reviewer only), items to confirm, and where the .docx file is stored.
--   Storage bucket "proposals": private; .docx only; 1 MB; staff may download, only the agent saves.

create table public.proposals (
  id bigint generated always as identity primary key,
  inquiry_id text not null references public.inquiries (id) on delete restrict,
  submission_id bigint not null references public.inquiry_submissions (id) on delete restrict,
  assessment_id bigint not null references public.setup_assessments (id) on delete restrict,
  version integer not null check (version >= 1),
  kind text not null check (kind in ('template', 'tailored')),
  status text not null default 'draft' check (status in ('draft', 'superseded')),
  sections jsonb not null,
  deviations jsonb not null default '[]'::jsonb,
  unresolved text[] not null default '{}',
  drafted_by text not null check (drafted_by in ('code', 'ai', 'by_hand', 'employee_edit')),
  model text,
  problems text[] not null default '{}',
  file_path text not null check (file_path ~ '^INQ-\d{4,}/v\d+\.docx$'),
  file_bytes integer not null check (file_bytes > 0 and file_bytes <= 1048576),
  edited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (inquiry_id, version),
  -- Never store client contact details.
  constraint no_email_in_sections check (sections::text !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}'),
  constraint no_phone_in_sections check (sections::text !~ '\(?\m\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\M')
);
comment on table public.proposals is 'One row per proposal draft (T4 template or T5 tailored), versioned per inquiry: the text placed in each section of the Word template, the departures from the standard template with their D2 reason (reviewer only), items to confirm, who or what drafted it, and the stored .docx file.';
create index proposals_inquiry_id_idx on public.proposals (inquiry_id);
-- At most one current draft per inquiry.
create unique index proposals_one_current_draft on public.proposals (inquiry_id) where status = 'draft';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proposals', 'proposals', false, 1048576, array['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy "Staff download proposals" on storage.objects
  for select to authenticated
  using (bucket_id = 'proposals' and (select private.is_staff()));

revoke all on public.proposals from anon, authenticated;
grant select on public.proposals to authenticated;
grant all on public.proposals to service_role;

alter table public.proposals enable row level security;
create policy "Staff see proposals" on public.proposals
  for select to authenticated using ((select private.is_staff()));
