// Lessons: every lesson the agent learned, with where it came from, and an on/off switch
// (a recorded click: who and when). Lesson and reason text is shown with textContent.
(async function () {
  const { sb, el, notice, formatDateTime, requireStaff, renderHeader } = window.JEvents;
  const page = document.getElementById("page");
  const ctx = await requireStaff(page);
  renderHeader("lessons.html", ctx);
  if (!ctx || !ctx.staff) return;

  const list = document.getElementById("list");
  const message = document.getElementById("message");
  const OUTCOME = { needs_revision: "Needs revision", needs_clarification: "Needs clarification", rejected: "Draft rejected" };

  async function load() {
    const [{ data, error }, { data: staff }] = await Promise.all([
      sb.from("lessons").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("staff_members").select("user_id, display_name"),
    ]);
    if (error) {
      list.replaceChildren(notice("bad", "Could not load lessons", "Reload the page."));
      return;
    }
    const names = Object.fromEntries((staff || []).map((s) => [s.user_id, s.display_name]));
    if (!data.length) {
      list.replaceChildren(el("p", { class: "empty", text: "No lessons yet. The agent learns one when a reviewer chooses Needs revision or Needs clarification, or rejects a clarification draft, and types a reason." }));
      return;
    }
    const source = (row) => {
      const [kind] = row.learned_from.split(":");
      const label = kind === "proposal_review" ? "Proposal review" : "Clarification draft";
      return row.inquiry_id
        ? [el("a", { href: `inquiry.html?id=${encodeURIComponent(row.inquiry_id)}`, text: row.inquiry_id }), ` · ${label} · ${OUTCOME[row.outcome] || row.outcome}`]
        : [`${label} · ${OUTCOME[row.outcome] || row.outcome}`];
    };
    list.replaceChildren(el("table", { class: "stack-sm" },
      el("thead", {}, el("tr", {}, ["Lesson", "Topic", "Learned from", "Reason given", "Learned", "On", ""].map((h) => el("th", { text: h })))),
      el("tbody", {}, data.map((row) => {
        const button = el("button", { type: "button", class: "secondary small", text: row.active ? "Switch off" : "Switch on" });
        button.addEventListener("click", async () => {
          button.disabled = true;
          const { error: e } = await sb.rpc("set_lesson_active", { p_id: row.id, p_active: !row.active });
          if (e) {
            message.replaceChildren(notice("bad", "Not changed", e.message));
            button.disabled = false;
            return;
          }
          message.replaceChildren(notice("ok", row.active ? "Lesson switched off" : "Lesson switched on",
            row.active ? "The agent forgets it from the next run." : "The agent reads it again from the next run."));
          await load();
        });
        return el("tr", {},
          el("td", { "data-label": "Lesson", text: row.lesson }),
          el("td", { "data-label": "Topic", text: `${row.topic}${row.event_type ? ` (${row.event_type} only)` : ""}` }),
          el("td", { "data-label": "Learned from" }, ...source(row)),
          el("td", { "data-label": "Reason given", text: `"${row.reason}"` }),
          el("td", { "data-label": "Learned", class: "nowrap", text: formatDateTime(row.created_at) }),
          el("td", { "data-label": "On" },
            el("span", { class: `badge ${row.active ? "sufficient" : "neutral"}`, text: row.active ? "On" : "Off" }),
            row.switched_at ? el("div", { class: "note", text: `by ${names[row.switched_by] || "a staff member"}, ${formatDateTime(row.switched_at)}` }) : ""),
          el("td", {}, button));
      }))));
  }
  await load();
})();
