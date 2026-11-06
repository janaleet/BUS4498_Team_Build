// One inquiry: the D1 decision with its reasons, the six details with their status
// and supporting sentence, anything flagged for a person, what the agent checked,
// the de-identified text, and the by-hand form when the details must be typed in.
(async function () {
  const { sb, LABELS, el, notice, formatDateTime, requireStaff, renderHeader, callFunction, reportProblemButton } = window.JEvents;
  const page = document.getElementById("page");
  const ctx = await requireStaff(page);
  renderHeader("dashboard.html", ctx);
  if (!ctx || !ctx.staff) return;

  const id = new URLSearchParams(location.search).get("id") || "";
  const content = document.getElementById("content");
  const message = document.getElementById("message");
  if (!/^INQ-\d{4,}$/.test(id)) {
    content.replaceChildren(notice("bad", "Unknown inquiry", "Open an inquiry from the dashboard."));
    return;
  }
  document.getElementById("title").textContent = id;
  document.title = `${id} · JEvents Proposals`;

  const REQUIRED = ["event_type", "event_date", "start_time", "end_time", "guest_count", "preferred_layout"];
  const OPTIONAL = ["room_preference", "av_requests", "catering", "special_requests", "budget"];
  const LAYOUTS = ["theater", "classroom", "banquet", "reception", "boardroom"];

  async function load() {
    const [{ data: inquiry, error }, { data: submissions }, { data: alerts }] = await Promise.all([
      sb.from("inquiries").select("*").eq("id", id).maybeSingle(),
      sb.from("inquiry_submissions").select("*").eq("inquiry_id", id).order("submission_number", { ascending: false }),
      sb.from("coordinator_alerts").select("task, problem, created_at, resolved_at").eq("inquiry_id", id).order("created_at"),
    ]);
    if (error || !inquiry) {
      content.replaceChildren(notice("bad", "Inquiry not found", "Check the inquiry ID, or open it from the dashboard."));
      return;
    }
    const sub = (submissions || [])[0];
    document.getElementById("meta").replaceChildren(
      el("span", { text: `Received ${formatDateTime(inquiry.created_at)}` }),
      el("span", { text: `Status: ${LABELS.status[inquiry.status] || inquiry.status}` }),
      el("span", { text: `Next step: ${LABELS.nextStep[inquiry.next_step] || inquiry.next_step}` }));

    const parts = [];
    parts.push(decisionCard(inquiry, sub));
    if (sub && sub.flags && sub.flags.length) {
      parts.push(el("section", { class: "card" },
        el("h2", { style: "margin-top:0", text: "Flagged for a person" }),
        el("p", { text: "These lines in the inquiry tried to instruct the agent. They were not followed." }),
        el("ul", {}, sub.flags.map((line) => el("li", { class: "quote", text: line })))));
    }
    if (inquiry.next_step === "enter_details_by_hand" && sub && ["pending", "failed"].includes(sub.extraction_status)) {
      parts.push(byHandForm(sub));
    }
    if (sub && sub.fields && Object.keys(sub.fields).length) parts.push(fieldsCard(sub.fields));
    if (sub) {
      parts.push(el("section", { class: "card" },
        el("h2", { style: "margin-top:0", text: "De-identified inquiry" }),
        el("pre", { class: "source", text: sub.deidentified_text })));
    }
    if (sub && sub.checked && sub.checked.length) {
      parts.push(el("section", { class: "card" },
        el("h2", { style: "margin-top:0", text: "What the agent checked" }),
        el("ul", {}, sub.checked.map((line) => el("li", { text: line })))));
    }
    if (alerts && alerts.length) {
      parts.push(el("section", { class: "card" },
        el("h2", { style: "margin-top:0", text: "Coordinator alerts" }),
        el("ul", { class: "plain" }, alerts.map((a) => el("li", {},
          el("strong", { text: `${a.task}: ` }), a.problem,
          el("span", { class: "note", text: ` · ${formatDateTime(a.created_at)}${a.resolved_at ? " · resolved" : ""}` }))))));
    }
    content.replaceChildren(...parts);
  }

  function decisionCard(inquiry, sub) {
    let badge;
    let explanation;
    if (inquiry.d1_result === "sufficient") {
      badge = el("span", { class: "badge sufficient", text: "Details sufficient" });
      explanation = "All six required details were found and none conflict. Next: Task 3, setup needs.";
    } else if (inquiry.d1_result === "missing") {
      badge = el("span", { class: "badge missing", text: "Details missing" });
      const names = (sub && sub.missing_fields || []).map((n) => LABELS.fields[n] || n);
      explanation = `Missing or conflicting: ${names.join(", ")}. Next: Task 2, a clarification request to the client.`;
    } else if (inquiry.next_step === "enter_details_by_hand") {
      badge = el("span", { class: "badge failed", text: "Held for a person" });
      explanation = sub && sub.extraction_status === "failed"
        ? `The AI could not read this inquiry (${sub.extraction_error || "unknown reason"}). Enter the six details below.`
        : "Waiting for an employee to enter the six details below.";
    } else {
      badge = el("span", { class: "badge neutral", text: "Not decided" });
      explanation = "The inquiry is still being read.";
    }
    return el("section", { class: "card" },
      el("div", { class: "switch-row" },
        el("h2", { style: "margin:0", text: "D1 · Sufficient event details?" }), badge,
        inquiry.d1_result ? reportProblemButton(id, "D1 decision and extracted details") : null),
      el("p", { text: explanation }),
      sub && sub.model ? el("p", { class: "hint", text: `Read by ${sub.model}${sub.extraction_method === "by_hand" ? " (then entered by hand)" : ""}.` }) : null);
  }

  function fieldsCard(fields) {
    const row = (name) => {
      const f = fields[name] || { value: "", status: "missing", evidence: "" };
      return el("tr", {},
        el("td", { "data-label": "Detail", text: LABELS.fields[name] || name }),
        el("td", { "data-label": "Status" }, el("span", { class: `badge ${f.status}`, text: f.status })),
        el("td", { "data-label": "Value", text: f.value || "—" }),
        el("td", { "data-label": "Supporting sentence" },
          f.evidence ? el("span", { class: "quote", text: `“${f.evidence}”` }) : "—",
          f.evidence && f.evidence_in_text === false && f.evidence !== "Entered by employee"
            ? el("span", { class: "note", text: "Not found word for word in the inquiry — check it." }) : null));
    };
    const table = (names) => el("table", { class: "stack-sm" },
      el("thead", {}, el("tr", {}, ["Detail", "Status", "Value", "Supporting sentence"].map((h) => el("th", { text: h })))),
      el("tbody", {}, names.map(row)));
    return el("section", { class: "card table-wrap" },
      el("h2", { style: "margin-top:0", text: "Required details" }), table(REQUIRED),
      el("h2", { text: "Optional details" }), table(OPTIONAL));
  }

  function byHandForm(sub) {
    const inputs = {};
    const form = el("form", { class: "grid-2" });
    for (const name of REQUIRED) {
      const fieldId = `f-${name}`;
      let input;
      if (name === "preferred_layout") {
        input = el("select", { id: fieldId }, el("option", { value: "", text: "— not given —" }),
          LAYOUTS.map((l) => el("option", { value: l, text: l[0].toUpperCase() + l.slice(1) })));
      } else {
        const hints = { event_date: "YYYY-MM-DD", start_time: "e.g. 9:00 AM", end_time: "e.g. 3:00 PM", guest_count: "one whole number" };
        input = el("input", { id: fieldId, type: "text", maxlength: "200", placeholder: hints[name] || "" });
      }
      inputs[name] = input;
      form.append(el("div", {}, el("label", { for: fieldId, text: LABELS.fields[name] }), input));
    }
    const status = el("div");
    const save = el("button", { type: "button", text: "Save details and decide" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      save.textContent = "Saving…";
      const fields = Object.fromEntries(Object.entries(inputs).map(([k, input]) => [k, input.value]));
      const result = await callFunction("agent", { action: "manual", inquiry_id: id, fields });
      save.disabled = false;
      save.textContent = "Save details and decide";
      if (!result.ok) {
        status.replaceChildren(notice("bad", result.status === "paused" ? "The agent is paused" : "Not saved", result.error || (result.reasons || []).join(" ")));
        return;
      }
      message.replaceChildren(notice("ok", "Details saved", (result.reasons || []).join(" ")));
      await load();
    });
    return el("section", { class: "card" },
      el("h2", { style: "margin-top:0", text: "Enter the six details by hand" }),
      el("p", { class: "hint", text: "Leave a field empty if the inquiry doesn't give it; it will be asked in the clarification request. Don't type client names or contact details." }),
      form, status, el("div", { class: "actions" }, save));
  }

  await load();
})();
