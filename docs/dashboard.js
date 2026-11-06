(async function () {
  const { sb, LABELS, el, notice, formatDateTime, requireStaff, renderHeader } = window.JEvents;
  const page = document.getElementById("page");
  const ctx = await requireStaff(page);
  renderHeader("dashboard.html", ctx);
  if (!ctx || !ctx.staff) return;

  if (ctx.staff.role === "employee") {
    document.getElementById("actions").append(
      el("p", {}, el("a", { class: "button", href: "new-inquiry.html", text: "New inquiry" })));
  }

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
  if (data.length === 0) {
    list.replaceChildren(el("p", { class: "empty", text: "No inquiries yet." }));
    return;
  }
  const d1Badge = (value) => value
    ? el("span", { class: `badge ${value}`, text: value === "sufficient" ? "Details sufficient" : "Details missing" })
    : el("span", { class: "badge neutral", text: "Not decided" });
  list.replaceChildren(el("table", { class: "stack-sm" },
    el("thead", {}, el("tr", {}, ["Inquiry", "Received", "Status", "Details", "Next step"].map((h) => el("th", { text: h })))),
    el("tbody", {}, data.map((row) => el("tr", {},
      el("td", { "data-label": "Inquiry" }, el("a", { href: `inquiry.html?id=${encodeURIComponent(row.id)}`, text: row.id })),
      el("td", { "data-label": "Received", text: formatDateTime(row.created_at) }),
      el("td", { "data-label": "Status", text: LABELS.status[row.status] || row.status }),
      el("td", { "data-label": "Details" }, d1Badge(row.d1_result)),
      el("td", { "data-label": "Next step", text: LABELS.nextStep[row.next_step] || row.next_step }),
    )))));
})();
