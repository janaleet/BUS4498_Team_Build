// Settings a signed-in reviewer may change: Paused (the off switch), the daily AI
// limit, test runs per day, and holidays. Changes go through change_setting, which
// requires a reason and records who and when.
(async function () {
  const { sb, el, notice, formatDateTime, requireStaff, renderHeader, showPausedBanner } = window.JEvents;
  const page = document.getElementById("page");
  const ctx = await requireStaff(page);
  renderHeader("settings.html", ctx);
  if (!ctx || !ctx.staff) return;

  const message = document.getElementById("message");
  const holder = document.getElementById("settings");

  async function change(key, value, reasonInput, status) {
    const reason = reasonInput.value.trim();
    if (reason.length < 3) {
      status.replaceChildren(notice("bad", "Add a reason", "Every change needs a short reason (at least 3 characters)."));
      reasonInput.focus();
      return false;
    }
    const { error } = await sb.rpc("change_setting", { p_key: key, p_value: value, p_reason: reason });
    if (error) {
      status.replaceChildren(notice("bad", "Not changed", error.message));
      return false;
    }
    message.replaceChildren(notice("ok", "Setting changed", "The agent uses the new value on its next run."));
    await render();
    await showPausedBanner();
    return true;
  }

  function reasonField(key) {
    return el("input", { id: `reason-${key}`, type: "text", maxlength: "500", placeholder: "Why are you changing this?" });
  }

  function card(row) {
    const status = el("div");
    const reason = reasonField(row.key);
    const changed = row.changed_by
      ? `Last changed ${formatDateTime(row.changed_at)} · Reason: ${row.reason}`
      : `Starting value · ${row.reason}`;
    let control;
    if (row.kind === "switch") {
      const on = row.value === true;
      control = el("div", { class: "switch-row" },
        el("span", { class: `badge ${on ? "missing" : "sufficient"}`, text: on ? "Paused: ON — the agent does nothing" : "Paused: off — the agent runs" }),
        el("button", { type: "button", class: on ? "" : "secondary", text: on ? "Switch Paused off" : "Pause the agent",
          onclick: () => change(row.key, !on, reason, status) }));
    } else if (row.kind === "number") {
      const input = el("input", { id: `value-${row.key}`, type: "number", min: "0", max: "1000", step: "1", value: String(row.value) });
      control = el("div", {},
        el("label", { for: input.id, text: "Value" }), input,
        el("div", { class: "actions" }, el("button", { type: "button", text: "Save", onclick: () => {
          const n = Number(input.value);
          if (!Number.isInteger(n) || n < 0 || n > 1000) {
            status.replaceChildren(notice("bad", "Not a valid number", "Use a whole number from 0 to 1000."));
            return;
          }
          change(row.key, n, reason, status);
        } })));
    } else {
      const dates = Array.isArray(row.value) ? row.value : [];
      const input = el("input", { id: `value-${row.key}`, type: "date" });
      control = el("div", {},
        dates.length
          ? el("ul", { class: "plain" }, dates.map((d) => el("li", {}, d, " ",
              el("button", { type: "button", class: "link", text: "Remove",
                onclick: () => change(row.key, dates.filter((x) => x !== d), reason, status) }))))
          : el("p", { class: "empty", text: "No holidays yet. Deadlines count Monday–Friday only." }),
        el("label", { for: input.id, text: "Add a holiday" }), input,
        el("div", { class: "actions" }, el("button", { type: "button", text: "Add holiday", onclick: () => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input.value)) {
            status.replaceChildren(notice("bad", "Pick a date", "Choose the holiday's date first."));
            return;
          }
          change(row.key, [...new Set([...dates, input.value])].sort(), reason, status);
        } })));
    }
    return el("section", { class: "card" },
      el("h2", { style: "margin-top:0", text: row.label }),
      el("p", { class: "hint", text: changed }),
      el("label", { for: reason.id, text: "Reason for the change" }), reason,
      control, status);
  }

  async function render() {
    const order = ["paused", "ai_daily_run_limit", "test_runs_per_day", "holidays"];
    const { data, error } = await sb.from("settings").select("key, label, kind, value, reason, changed_by, changed_at");
    if (error) {
      holder.replaceChildren(notice("bad", "Could not load settings", "Reload the page."));
      return;
    }
    data.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    holder.replaceChildren(...data.map(card));

    const { data: history } = await sb.from("settings_history").select("key, old_value, new_value, reason, changed_at")
      .order("changed_at", { ascending: false }).limit(50);
    document.getElementById("history").replaceChildren(history && history.length
      ? el("ul", { class: "plain" }, history.map((h) => el("li", {},
          el("strong", { text: h.key }), ` ${JSON.stringify(h.old_value)} → ${JSON.stringify(h.new_value)} · `,
          el("span", { class: "quote", text: h.reason }), el("span", { class: "note", text: ` · ${formatDateTime(h.changed_at)}` }))))
      : el("p", { class: "empty", text: "No changes yet." }));
  }

  async function renderReports() {
    const { data, error } = await sb.from("problem_reports").select("inquiry_id, about, note, created_at")
      .order("created_at", { ascending: false }).limit(100);
    document.getElementById("reports").replaceChildren(error
      ? notice("bad", "Could not load reports", "Reload the page.")
      : data.length
      ? el("ul", { class: "plain" }, data.map((r) => el("li", {},
          r.inquiry_id ? el("a", { href: `inquiry.html?id=${encodeURIComponent(r.inquiry_id)}`, text: r.inquiry_id }) : "—",
          ` · ${r.about}: `, el("span", { text: r.note }), el("span", { class: "note", text: ` · ${formatDateTime(r.created_at)}` }))))
      : el("p", { class: "empty", text: "No problems reported." }));
  }

  await render();
  await renderReports();
})();
