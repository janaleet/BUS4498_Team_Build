-- Permission plan, Never 6: the agent never changes the rooms inventory (a database rule).
-- Only a signed-in staff member may add, change or remove a room or its change history,
-- which the Rooms page does through save_room (with a reason). The agent's secret key has
-- no signed-in user, so any write it tried is refused here, whatever the code says.
-- Maintenance by the project owner in the SQL editor: disable this trigger for that change.

create or replace function private.rooms_staff_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Only a signed-in employee can change the rooms inventory (Rooms page, with a reason).' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger rooms_staff_only before insert or update or delete on public.rooms
  for each row execute function private.rooms_staff_only();
create trigger room_changes_staff_only before insert or update or delete on public.room_changes
  for each row execute function private.rooms_staff_only();

revoke all on function private.rooms_staff_only() from public, anon, authenticated;
