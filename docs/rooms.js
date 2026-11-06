// Rooms and equipment (memory plan item 2): staff keep it current; the agent reads
// the active rooms on every run. Changes go through save_room, which needs a reason
// and records who and when. Rooms are switched off, never deleted.
(async function () {
  const { sb, el, notice, formatDateTime, requireStaff, renderHeader } = window.JEvents;
  const page = document.getElementById("page");
  const ctx = await requireStaff(page);
  renderHeader("rooms.html", ctx);
  if (!ctx || !ctx.staff) return;

  const message = document.getElementById("message");
  const list = document.getElementById("list");
  const editor = document.getElementById("editor");

  const NUMBERS = [
    ["theater_capacity", "Theater capacity"], ["classroom_capacity", "Classroom capacity"],
    ["banquet_capacity", "Banquet capacity"], ["reception_capacity", "Reception capacity"],
    ["boardroom_capacity", "Boardroom capacity"], ["six_ft_tables", "Six-foot tables"],
    ["round_tables_60in", "Sixty-inch round tables"], ["cocktail_tables", "Cocktail tables"],
    ["chairs", "Chairs"], ["projectors", "Projectors"], ["screens_or_displays", "Screens or displays"],
    ["wireless_mics", "Wireless microphones"],
  ];
  const yes = (v) => (v ? "yes" : "no");

  function openEditor(room) {
    const isNew = !room;
    room = room || { name: "", notes: "", speaker_system: false, video_conferencing: false, active: true };
    const inputs = {};
    const name = el("input", { id: "room-name", type: "text", maxlength: "80", value: room.name, readonly: isNew ? null : true });
    const grid = el("div", { class: "grid-2" }, NUMBERS.map(([key, label]) => {
      inputs[key] = el("input", { id: `room-${key}`, type: "number", min: "0", step: "1", value: String(room[key] ?? 0) });
      return el("div", {}, el("label", { for: inputs[key].id, text: label }), inputs[key]);
    }));
    const speaker = el("input", { id: "room-speaker", type: "checkbox", checked: room.speaker_system ? true : null });
    const video = el("input", { id: "room-video", type: "checkbox", checked: room.video_conferencing ? true : null });
    const active = el("input", { id: "room-active", type: "checkbox", checked: room.active !== false ? true : null });
    const notes = el("input", { id: "room-notes", type: "text", maxlength: "500", value: room.notes || "" });
    const reason = el("input", { id: "room-reason", type: "text", maxlength: "500", placeholder: "Why are you changing this room?" });
    const status = el("div");
    const save = el("button", { type: "button", text: isNew ? "Add room" : "Save changes" });
    save.addEventListener("click", async () => {
      const payload = { name: name.value.trim(), notes: notes.value.trim(), speaker_system: speaker.checked, video_conferencing: video.checked, active: active.checked };
      for (const [key] of NUMBERS) payload[key] = String(inputs[key].value).trim();
      if (!payload.name) return status.replaceChildren(notice("bad", "Name the room", "Every room needs a name."));
      if (NUMBERS.some(([key]) => !/^\d{1,5}$/.test(payload[key]))) {
        return status.replaceChildren(notice("bad", "Check the numbers", "Use whole numbers (0 or more) in every box."));
      }
      if (reason.value.trim().length < 3) {
        reason.focus();
        return status.replaceChildren(notice("bad", "Add a reason", "Every change needs a short reason (at least 3 characters)."));
      }
      save.disabled = true;
      const { error } = await sb.rpc("save_room", { p_room: payload, p_reason: reason.value.trim() });
      save.disabled = false;
      if (error) return status.replaceChildren(notice("bad", "Not saved", error.message));
      editor.hidden = true;
      message.replaceChildren(notice("ok", "Room saved", "The agent uses the new numbers on its next run."));
      await render();
    });
    editor.replaceChildren(
      el("h2", { style: "margin-top:0", text: isNew ? "Add a room" : `Edit ${room.name}` }),
      el("label", { for: name.id, text: "Room name" }), name, grid,
      el("label", { class: "check", for: speaker.id }, speaker, el("span", { text: "Has a speaker system" })),
      el("label", { class: "check", for: video.id }, video, el("span", { text: "Has video conferencing" })),
      el("label", { class: "check", for: active.id }, active, el("span", { text: "In use (untick to switch the room off; it is never deleted)" })),
      el("label", { for: notes.id, text: "Notes" }), notes,
      el("label", { for: reason.id, text: "Reason for the change" }), reason,
      status,
      el("div", { class: "actions" }, save, el("button", { type: "button", class: "secondary", text: "Cancel", onclick: () => { editor.hidden = true; } })));
    editor.hidden = false;
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function render() {
    const { data, error } = await sb.from("rooms").select("*").order("name");
    if (error) {
      list.replaceChildren(notice("bad", "Could not load rooms", "Reload the page."));
      return;
    }
    const example = data.some((r) => r.is_example);
    list.replaceChildren(
      example ? notice("info", "Example venue data", "Rooms marked “example” come from rooms-and-equipment.csv. Edit them to match your real venue.") : "",
      el("table", { class: "stack-sm" },
        el("thead", {}, el("tr", {}, ["Room", "Theater", "Class", "Banquet", "Reception", "Board", "6-ft", "Rounds", "Cocktail", "Chairs", "AV", ""].map((h) => el("th", { text: h })))),
        el("tbody", {}, data.map((r) => el("tr", {},
          el("td", { "data-label": "Room" }, el("strong", { text: r.name }),
            r.is_example ? el("span", { class: "badge neutral", text: " example" }) : "",
            r.active ? "" : el("span", { class: "badge missing", text: " off" }),
            r.notes ? el("span", { class: "note", text: r.notes }) : ""),
          ...["theater_capacity", "classroom_capacity", "banquet_capacity", "reception_capacity", "boardroom_capacity",
            "six_ft_tables", "round_tables_60in", "cocktail_tables", "chairs"].map((k) =>
            el("td", { "data-label": NUMBERS.find(([key]) => key === k)[1], text: String(r[k]) })),
          el("td", { "data-label": "AV", text: `${r.projectors} projector(s), ${r.screens_or_displays} screen(s), ${r.wireless_mics} mic(s), speakers ${yes(r.speaker_system)}, video ${yes(r.video_conferencing)}` }),
          el("td", {}, el("button", { type: "button", class: "secondary small", text: "Edit", onclick: () => openEditor(r) })),
        )))));

    const { data: changes } = await sb.from("room_changes").select("room, reason, changed_at").order("changed_at", { ascending: false }).limit(50);
    document.getElementById("history").replaceChildren(changes && changes.length
      ? el("ul", { class: "plain" }, changes.map((c) => el("li", {}, el("strong", { text: c.room }), " · ",
          el("span", { class: "quote", text: c.reason }), el("span", { class: "note", text: ` · ${formatDateTime(c.changed_at)}` }))))
      : el("p", { class: "empty", text: "No changes yet." }));
  }

  document.getElementById("add").addEventListener("click", () => openEditor(null));
  await render();
})();
