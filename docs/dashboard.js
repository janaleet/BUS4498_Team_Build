(async function () {
  const { sb, LABELS, el, notice, formatDateTime, requireStaff, renderHeader, reportProblemButton } = window.JEvents;
  const page = document.getElementById("page");
  const ctx = await requireStaff(page);
  renderHeader("dashboard.html", ctx);
  if (!ctx || !ctx.staff) return;

  document.getElementById("actions").append(
    el("p", {}, el("a", { class: "button", href: "new-inquiry.html", text: "New inquiry" })));

  const list = document.getElementById("list");
  const { data, error } = await sb
    .from("inquiries")
    .select("id, status, next_step, d1_result, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    list.replaceChildren(notice("bad", "Could not load inquiries", "Reload the page. If it keeps happening, tell the event coordinator."));
    return;
  }
  // T6: a draft waiting for review longer than 10 minutes is flagged.
  const waiting = data.filter((row) => row.next_step === "t6_review").map((row) => row.id);
  const since = {};
  if (waiting.length) {
    const { data: drafts } = await sb.from("proposals").select("inquiry_id, created_at").eq("status", "draft").in("inquiry_id", waiting);
    for (const d of drafts || []) since[d.inquiry_id] = d.created_at;
  }
  const nextStepCell = (row) => {
    const text = LABELS.nextStep[row.next_step] || row.next_step;
    const minutes = since[row.id] ? Math.floor((Date.now() - new Date(since[row.id]).getTime()) / 60000) : 0;
    return minutes > 10
      ? [text, el("div", { class: "overdue", text: `Review overdue: waiting ${minutes >= 120 ? `${Math.floor(minutes / 60)} h` : `${minutes} min`} (limit 10 min)` })]
      : [text];
  };
  if (data.length === 0) {
    list.replaceChildren(el("p", { class: "empty", text: "No inquiries yet." }));
    return;
  }
  const d1Badge = (row) => row.d1_result
    ? el("span", { class: `badge ${row.d1_result}`, text: row.d1_result === "sufficient" ? "Details sufficient" : "Details missing" })
    : ["enter_details_by_hand", "held_setup_shortage"].includes(row.next_step)
    ? el("span", { class: "badge failed", text: "Held for a person" })
    : el("span", { class: "badge neutral", text: "Not decided" });
  list.replaceChildren(el("table", { class: "stack-sm" },
    el("thead", {}, el("tr", {}, ["Inquiry", "Received", "Status", "Details (D1)", "Next step", ""].map((h) => el("th", { text: h })))),
    el("tbody", {}, data.map((row) => el("tr", {},
      el("td", { "data-label": "Inquiry", class: "nowrap" }, el("a", { href: `inquiry.html?id=${encodeURIComponent(row.id)}`, text: row.id })),
      el("td", { "data-label": "Received", class: "nowrap", text: formatDateTime(row.created_at) }),
      el("td", { "data-label": "Status", text: LABELS.status[row.status] || row.status }),
      el("td", { "data-label": "Details (D1)" }, d1Badge(row)),
      el("td", { "data-label": "Next step" }, ...nextStepCell(row)),
      el("td", {}, row.d1_result ? reportProblemButton(row.id, "D1 decision and extracted details") : null),
    )))));
})();
