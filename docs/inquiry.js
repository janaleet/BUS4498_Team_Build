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
  let staffNames = {};
  const who = (userId) => staffNames[userId] || "a staff member";

  async function load() {
    const [{ data: inquiry, error }, { data: submissions }, { data: alerts }, { data: assessments }, { data: requests }, { data: staff }] = await Promise.all([
      sb.from("inquiries").select("*").eq("id", id).maybeSingle(),
      sb.from("inquiry_submissions").select("*").eq("inquiry_id", id).order("submission_number", { ascending: false }),
      sb.from("coordinator_alerts").select("task, problem, created_at, resolved_at").eq("inquiry_id", id).order("created_at"),
      sb.from("setup_assessments").select("*").eq("inquiry_id", id).order("created_at", { ascending: false }).limit(1),
      sb.from("clarification_requests").select("*").eq("inquiry_id", id).order("id", { ascending: false }),
      sb.from("staff_members").select("user_id, display_name"),
    ]);
    const { data: proposals } = await sb.from("proposals").select("*").eq("inquiry_id", id).order("version", { ascending: false });
    staffNames = Object.fromEntries((staff || []).map((s) => [s.user_id, s.display_name]));
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
    const assessment = (assessments || [])[0];
    if (assessment) parts.push(setupCard(assessment));
    else if (inquiry.next_step === "held_setup_shortage") {
      parts.push(el("section", { class: "card" }, notice("warn", "Setup needs not worked out",
        "The room list could not be read. The event coordinator was told; try again once the Rooms page loads.")));
    }
    if ((requests && requests.length) || ["waiting_for_client", "stopped_no_response"].includes(inquiry.status)) {
      parts.push(clarificationCard(inquiry, requests || []));
    }
    if ((proposals && proposals.length) || ["t4_template_proposal", "t5_tailored_proposal"].includes(inquiry.next_step)) {
      parts.push(proposalCard(inquiry, proposals || []));
    }
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
        el("h2", { style: "margin-top:0", text: submissions.length > 1 ? "Messages from the client (de-identified, newest first)" : "De-identified inquiry" }),
        submissions.map((s) => [
          submissions.length > 1 ? el("h3", { text: `${s.kind === "client_reply" ? "Client reply" : "Original inquiry"} · ${formatDateTime(s.created_at)}` }) : "",
          el("pre", { class: "source", text: s.deidentified_text }),
        ])));
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

  /** T3 setup needs and the D2 decision. */
  function setupCard(a) {
    const routeClass = { template: "sufficient", tailored: "neutral", clarify: "missing", held: "failed" }[a.route];
    const statusBadge = (s) => el("span", { class: `badge ${s === "needed" ? "found" : s === "unknown" ? "conflicting" : "neutral"}`, text: s });
    const rows = [
      ...(a.tables || []).map((t) => ({ item: t.item, qty: t.qty, status: t.status, source: t.source })),
      ...(a.chairs ? [{ item: "Chairs", qty: a.chairs.qty, status: a.chairs.status, source: a.chairs.source }] : []),
      ...(a.av || []).map((x) => ({ item: x.item, qty: x.status === "not needed" ? "—" : x.qty, status: x.status, source: x.source })),
      ...(a.setup_teardown ? [{ item: "Setup and teardown", qty: "—", status: a.setup_teardown.status, source: a.setup_teardown.source }] : []),
    ];
    const yesNo = (v) => el("span", { class: `badge ${v ? "found" : "missing"}`, text: v ? "yes" : "no" });
    const list = (title, items) => items && items.length
      ? [el("h3", { text: title }), el("ul", {}, items.map((i) => el("li", { text: i })))] : [];
    return el("section", { class: "card" },
      el("div", { class: "switch-row" },
        el("h2", { style: "margin:0", text: "T3 · Setup needs and D2 · Use template?" }),
        el("span", { class: `badge ${routeClass}`, text: LABELS.route[a.route] || a.route }),
        reportProblemButton(id, "T3 setup needs and D2 route")),
      el("p", {}, a.room
        ? `Recommended room: ${a.room} (${a.layout} capacity ${a.room_capacity}) for ${a.guest_count} guests.`
        : `No room recommended for ${a.guest_count} guests in a ${a.layout} layout.`),
      el("div", { class: "table-wrap" }, el("table", { class: "stack-sm" },
        el("thead", {}, el("tr", {}, ["Item", "Quantity", "Status", "Source"].map((h) => el("th", { text: h })))),
        el("tbody", {}, rows.map((r) => el("tr", {},
          el("td", { "data-label": "Item", text: r.item }),
          el("td", { "data-label": "Quantity", text: String(r.qty) }),
          el("td", { "data-label": "Status" }, statusBadge(r.status)),
          el("td", { "data-label": "Source", text: r.source })))))),
      el("h3", { text: "D2 checks" }),
      el("ul", { class: "plain" },
        el("li", {}, "Event type on the template list: ", yesNo(a.on_template_list), ` (${a.event_type})`),
        el("li", {}, "Guest count fits a standard layout of the room: ", yesNo(a.fits_standard_layout)),
        el("li", {}, "Special requests: ", a.special_requests.length ? a.special_requests.join("; ") : "none",
          a.special_requests_checked ? "" : el("span", { class: "note", text: "Special requests not checked – review in T6." }))),
      ...list("Held for a person", a.shortages),
      ...list("Unresolved", a.unresolved),
      ...list("Questions for the client", a.questions),
      ...list("Assumptions", a.assumptions),
      (a.checked && a.checked.length) ? el("p", { class: "hint", text: `Checked: ${a.checked.join(" · ")}` }) : "");
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
          f.evidence && f.evidence_in_text === false && f.evidence !== "Entered by employee" && !f.evidence.startsWith("From the earlier message")
            ? el("span", { class: "note", text: "Not found word for word in the inquiry — check it." }) : null));
    };
    const table = (names) => el("table", { class: "stack-sm" },
      el("thead", {}, el("tr", {}, ["Detail", "Status", "Value", "Supporting sentence"].map((h) => el("th", { text: h })))),
      el("tbody", {}, names.map(row)));
    return el("section", { class: "card table-wrap" },
      el("h2", { style: "margin-top:0", text: "Required details" }), table(REQUIRED),
      el("h2", { text: "Optional details" }), table(OPTIONAL));
  }

  /**
   * T2 · Clarification request: draft (edit, approve, reject), rejected (redraft),
   * approved (copy, mark as sent), sent (reply-by date, paste the client's reply), plus the
   * day-2 reminder. Approve, reject and mark-sent are database functions that record who
   * and when; the agent itself can never approve or send.
   */
  function clarificationCard(inquiry, requests) {
    const STATUS = { draft: ["neutral", "Draft – waits for approval"], approved: ["found", "Approved – not sent yet"], rejected: ["conflicting", "Rejected"],
      sent: ["found", "Sent"], answered: ["sufficient", "Client replied"], superseded: ["neutral", "Replaced"] };
    const badge = (s) => el("span", { class: `badge ${STATUS[s][0]}`, text: STATUS[s][1] });
    const fmtDate = (d) => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
    const status = el("div");
    const run = async (button, label, fn) => {
      button.disabled = true;
      const original = button.textContent;
      button.textContent = label;
      try { await fn(); } finally { button.disabled = false; button.textContent = original; }
    };
    const rpcAction = async (fnName, args, okTitle, okBody) => {
      const { error } = await sb.rpc(fnName, args);
      if (error) { status.replaceChildren(notice("bad", "Not saved", error.message)); return false; }
      message.replaceChildren(notice("ok", okTitle, okBody));
      await load();
      return true;
    };

    function messageView(r) {
      const parts = [el("div", { class: "switch-row" }, el("h3", { style: "margin:0", text: r.kind === "reminder" ? "Reminder" : "Clarification request" }), badge(r.status))];
      if (r.drafted_by !== "ai" && r.draft_problems && r.draft_problems.length && r.status === "draft") {
        parts.push(notice("warn", r.drafted_by === "reminder_template" ? "Reminder from the template" : "Written from the checklist — check the wording", r.draft_problems.join(" ")));
      }
      if (r.status === "draft") {
        const subject = el("input", { id: `subj-${r.id}`, type: "text", value: r.subject, maxlength: "300" });
        const body = el("textarea", { id: `body-${r.id}`, spellcheck: "true" });
        body.value = r.body;
        const reason = el("input", { id: `why-${r.id}`, type: "text", maxlength: "500", placeholder: "Why is this draft not right?" });
        const approve = el("button", { type: "button", text: "Approve" });
        approve.addEventListener("click", () => run(approve, "Approving…", () => rpcAction("approve_clarification",
          { p_id: r.id, p_subject: subject.value, p_body: body.value },
          "Approved", "Copy it, send it from your own email with the client's name added, then click Mark as sent.")));
        const reject = el("button", { type: "button", class: "secondary", text: "Reject" });
        reject.addEventListener("click", () => {
          if (reason.value.trim().length < 3) {
            reason.focus();
            status.replaceChildren(notice("bad", "Add a reason", "Say why the draft isn't right (at least 3 characters)."));
            return;
          }
          run(reject, "Rejecting…", () => rpcAction("reject_clarification", { p_id: r.id, p_reason: reason.value.trim() },
            "Rejected", "Choose Redraft to have the AI write a new draft using your reason, or write it from the checklist."));
        });
        parts.push(
          el("p", { class: "hint", text: `Reply-by date in this draft: ${fmtDate(r.deadline)}. Approving resets it to 3 business days from today. You may edit the wording; the inquiry ID, the reply-by date and the reply line must stay, and no contact details may be added.` }),
          el("label", { for: subject.id, text: "Subject" }), subject,
          el("label", { for: body.id, text: "Message" }), body,
          el("div", { class: "actions" }, approve),
          el("label", { for: reason.id, text: "Or reject it, with a reason" }), reason,
          el("div", { class: "actions" }, reject));
        if (r.issues && r.issues.length) {
          parts.push(el("details", {}, el("summary", { text: "Where each question came from (not sent)" }),
            el("ul", {}, r.issues.map((i) => el("li", { text: `${i.label}: ${i.status}${i.known ? ` — the client said "${i.known}"` : ""} (${i.source})` })))));
        }
        return parts;
      }
      parts.push(el("pre", { class: "source", text: `Subject: ${r.subject}\n\n${r.body}` }));
      const facts = [];
      if (r.approved_at) facts.push(`Approved by ${who(r.approved_by)} on ${formatDateTime(r.approved_at)}${r.edited ? " (wording edited)" : ""}.`);
      if (r.sent_at) facts.push(`Sent by ${who(r.sent_by)} on ${formatDateTime(r.sent_at)}.`);
      if (r.rejected_at) facts.push(`Rejected by ${who(r.rejected_by)} on ${formatDateTime(r.rejected_at)}: "${r.reject_reason}"`);
      if (r.kind === "request" && ["sent"].includes(r.status)) facts.push(`Reply by ${fmtDate(r.deadline)}. Reminder due ${fmtDate(r.reminder_due)} if there's no reply.`);
      if (facts.length) parts.push(el("p", { class: "hint", text: facts.join(" ") }));
      if (r.status === "approved") {
        const copy = el("button", { type: "button", class: "secondary", text: "Copy message" });
        copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(`${r.subject}\n\n${r.body}`);
            copy.textContent = "Copied";
          } catch {
            status.replaceChildren(notice("warn", "Copy didn't work", "Select the text above and copy it by hand."));
          }
        });
        const sent = el("button", { type: "button", text: "Mark as sent" });
        sent.addEventListener("click", () => run(sent, "Saving…", () => rpcAction("mark_clarification_sent", { p_id: r.id },
          "Marked as sent", r.kind === "request" ? "The inquiry now waits for the client's reply." : "The reminder is recorded as sent.")));
        parts.push(el("p", { text: "Send it from your own email: add the client's name in place of [CLIENT NAME] and yours in place of [EMPLOYEE NAME]. Then click Mark as sent." }),
          el("div", { class: "actions" }, copy, sent));
      }
      return parts;
    }

    function redraftControls(r) {
      const ai = el("button", { type: "button", text: "Redraft with AI (uses your reason)" });
      const hand = el("button", { type: "button", class: "secondary", text: "Write from the checklist" });
      const go = (button, byHand) => run(button, "Drafting…", async () => {
        const result = await callFunction("agent", { action: "redraft", request_id: r.id, by_hand: byHand });
        if (!result.ok) { status.replaceChildren(notice("bad", "No new draft", result.error || (result.reasons || []).join(" "))); return; }
        message.replaceChildren(notice("ok", "New draft ready", (result.reasons || []).join(" ")));
        await load();
      });
      ai.addEventListener("click", () => go(ai, false));
      hand.addEventListener("click", () => go(hand, true));
      return el("div", { class: "actions" }, ai, hand);
    }

    function replyForm() {
      const raw = el("textarea", { id: "reply-raw", class: "short", placeholder: "Paste the client's reply here." });
      const cleaned = el("textarea", { id: "reply-clean", class: "short", hidden: true });
      const confirm = el("input", { id: "reply-confirm", type: "checkbox" });
      const confirmRow = el("label", { class: "check", for: "reply-confirm", hidden: true }, confirm,
        el("span", { text: "I checked the cleaned reply: no client names, email addresses, phone numbers, or street addresses remain." }));
      const check = el("button", { type: "button", class: "secondary", text: "Check for personal details" });
      const submit = el("button", { type: "button", text: "Submit reply", disabled: true });
      confirm.addEventListener("change", () => { submit.disabled = !confirm.checked; });
      check.addEventListener("click", () => run(check, "Checking…", async () => {
        const result = await callFunction("agent", { action: "preview", text: raw.value });
        if (!result.ok) { status.replaceChildren(notice("bad", "Not checked", result.error || "")); return; }
        cleaned.value = result.text;
        cleaned.hidden = false;
        confirmRow.hidden = false;
        status.replaceChildren(...(result.flags || []).map((line) => notice("warn", "This line tries to instruct the agent", `"${line}" — it will be flagged, not followed.`)));
      }));
      submit.addEventListener("click", () => run(submit, "Reading the reply (up to a minute)…", async () => {
        const result = await callFunction("agent", { action: "reply", inquiry_id: id, text: cleaned.value, confirmed: confirm.checked });
        if (!result.ok) { status.replaceChildren(notice("bad", "Reply not saved", result.error || (result.reasons || []).join(" "))); return; }
        message.replaceChildren(notice("ok", "Reply saved under the same inquiry ID", (result.reasons || []).join(" ")));
        await load();
      }));
      return [el("h3", { text: "The client replied?" }),
        el("label", { for: raw.id, text: "Paste the client's reply" }), raw,
        el("div", { class: "actions" }, check), cleaned, confirmRow, el("div", { class: "actions" }, submit)];
    }

    // The current round: the newest submission's request and reminder; older rounds go in history.
    const latestSubmission = requests.length ? Math.max(...requests.map((r) => r.submission_id)) : null;
    const current = requests.filter((r) => r.submission_id === latestSubmission);
    const latestRequest = current.filter((r) => r.kind === "request").sort((a, b) => b.id - a.id)[0];
    const activeRequest = current.filter((r) => r.kind === "request" && !["superseded"].includes(r.status)).sort((a, b) => b.id - a.id)[0] || latestRequest;
    const reminder = current.filter((r) => r.kind === "reminder").sort((a, b) => b.id - a.id)[0];
    const older = requests.filter((r) => !(r === activeRequest || r === reminder));

    const section = el("section", { class: "card" }, el("h2", { style: "margin-top:0", text: "T2 · Clarification request" }));
    if (inquiry.status === "stopped_no_response") {
      section.append(notice("warn", "Stopped – no response", "The client didn't reply by the reply-by date. No client personal information is kept."));
    }
    if (activeRequest) section.append(...messageView(activeRequest));
    if (activeRequest && activeRequest.status === "rejected") section.append(redraftControls(activeRequest));
    if (reminder) section.append(...messageView(reminder));
    if (inquiry.status === "waiting_for_client") section.append(...replyForm());
    section.append(status);
    if (older.length) {
      section.append(el("details", {}, el("summary", { text: `Earlier drafts and messages (${older.length})` }),
        el("ul", { class: "plain" }, older.map((r) => el("li", {},
          badge(r.status), ` ${r.kind === "reminder" ? "Reminder" : "Request"} · ${formatDateTime(r.created_at)}`,
          r.reject_reason ? el("span", { class: "note", text: `Rejected: "${r.reject_reason}"` }) : "")))));
    }
    section.append(reportProblemButton(id, "T2 clarification request"));
    return section;
  }

  /**
   * T4/T5 · Proposal: download the .docx, see the filled sections, the departures from the
   * standard template (reviewer only), items to confirm, and edit the tailored sections by
   * hand (code rebuilds the file as a new version; nothing is uploaded).
   */
  function proposalCard(inquiry, proposals) {
    const status = el("div");
    const current = proposals.find((p) => p.status === "draft");
    const section = el("section", { class: "card" }, el("h2", { style: "margin-top:0", text: "T4/T5 · Proposal" }));

    const download = async (p, button) => {
      button.disabled = true;
      const { data, error } = await sb.storage.from("proposals").createSignedUrl(p.file_path, 60, { download: `${id}-proposal-v${p.version}.docx` });
      button.disabled = false;
      if (error || !data) { status.replaceChildren(notice("bad", "Download didn't start", error ? error.message : "")); return; }
      location.href = data.signedUrl;
    };

    if (!current) {
      const draft = el("button", { type: "button", text: "Draft the proposal" });
      draft.addEventListener("click", async () => {
        draft.disabled = true;
        draft.textContent = "Drafting (up to a minute)…";
        const result = await callFunction("agent", { action: "draft_proposal", inquiry_id: id });
        draft.disabled = false;
        draft.textContent = "Draft the proposal";
        if (!result.ok) { status.replaceChildren(notice("bad", "No proposal drafted", result.error || (result.reasons || []).join(" "))); return; }
        message.replaceChildren(notice("ok", "Proposal drafted", (result.reasons || []).join(" ")));
        await load();
      });
      section.append(el("p", { text: "No proposal has been drafted for this inquiry yet." }), el("div", { class: "actions" }, draft));
    } else {
      const s = current.sections || {};
      const lines = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean);
      const kindBadge = el("span", { class: `badge ${current.kind === "template" ? "sufficient" : "neutral"}`, text: current.kind === "template" ? "Template (T4)" : "Tailored (T5)" });
      const by = { code: "filled by code", ai: `tailored sections by ${current.model}`, by_hand: "tailored sections need writing by hand", employee_edit: `edited by ${who(current.edited_by)}` }[current.drafted_by];
      const dl = el("button", { type: "button", text: `Download .docx (version ${current.version})` });
      dl.addEventListener("click", () => download(current, dl));
      section.append(
        el("div", { class: "switch-row" }, kindBadge, el("span", { class: "hint", text: `Version ${current.version}, ${by}, ${formatDateTime(current.created_at)}` })),
        current.problems && current.problems.length ? notice("warn", "Needs attention", current.problems.join(" ")) : "",
        el("div", { class: "actions" }, dl),
        el("p", { class: "hint", text: "Next: Task 6, review (coming in Group 5). Before sending, the employee adds the client's name and the venue's details in Word." }));
      const rows = [
        ["Event", `${s.event_type} · ${s.event_date} · ${s.start_time} – ${s.end_time} · ${s.guest_count} guests · ${s.layout}`],
        ["Room", `${s.room}`], ["Room notes", lines(s.room_notes)], ["Tables", lines(s.tables)], ["Chairs", s.chairs],
        ["AV equipment", lines(s.av_equipment)], ["Setup and teardown", lines(s.setup_requirements)],
        ["Items to confirm", lines(s.unresolved_items)], ["Assumptions", lines(s.assumptions)],
      ];
      section.append(el("div", { class: "table-wrap" }, el("table", { class: "stack-sm" },
        el("tbody", {}, rows.map(([label, v]) => el("tr", {},
          el("th", { scope: "row", text: label }),
          el("td", { "data-label": label }, Array.isArray(v) ? v.map((line) => el("div", { text: line })) : String(v))))))));
      if (current.deviations && current.deviations.length) {
        section.append(el("h3", { text: "Changes from the standard template (for the reviewer; not in the client's file)" }),
          el("ul", {}, current.deviations.map((d) => el("li", { text: `${d.section}: ${d.change} — because ${d.d2_reason}` }))));
      }

      // Edit the tailored sections by hand; code rebuilds the file.
      const asText = (v) => lines(v).filter((x) => x !== "None").join("\n");
      const inputs = {};
      const form = el("div", {});
      for (const [key, label, hint] of [
        ["room_notes", "Room notes", "One short paragraph."],
        ["setup_requirements", "Setup and teardown", "One line per item."],
        ["unresolved_items", "Items to confirm", "One line per item."],
        ["assumptions", "Assumptions", "One line per item."],
      ]) {
        inputs[key] = el("textarea", { id: `edit-${key}`, class: "short" });
        inputs[key].value = key === "room_notes" ? (Array.isArray(s.room_notes) ? s.room_notes.join(" ") : s.room_notes || "") : asText(s[key]);
        form.append(el("label", { for: inputs[key].id, text: `${label} ` }, el("span", { class: "hint", text: hint })), inputs[key]);
      }
      const save = el("button", { type: "button", text: "Save edits as a new version" });
      save.addEventListener("click", async () => {
        save.disabled = true;
        save.textContent = "Rebuilding…";
        const sections = Object.fromEntries(Object.entries(inputs).map(([k, input]) => [k, input.value]));
        const result = await callFunction("agent", { action: "rebuild_proposal", proposal_id: current.id, sections });
        save.disabled = false;
        save.textContent = "Save edits as a new version";
        if (!result.ok) { status.replaceChildren(notice("bad", "Not saved", result.error || (result.reasons || []).join(" "))); return; }
        message.replaceChildren(notice("ok", "New version saved", (result.reasons || []).join(" ")));
        await load();
      });
      section.append(el("details", {}, el("summary", { text: "Edit the tailored sections by hand" }),
        el("p", { class: "hint", text: "Write anything marked [TO CONFIRM – write by hand] here. Don't add client names or contact details, prices, or facts the client didn't give." }),
        form, el("div", { class: "actions" }, save)));
    }
    const older = proposals.filter((p) => p !== current);
    if (older.length) {
      section.append(el("details", {}, el("summary", { text: `Earlier versions (${older.length})` }),
        el("ul", { class: "plain" }, older.map((p) => {
          const b = el("button", { type: "button", class: "link", text: `Version ${p.version}` });
          b.addEventListener("click", () => download(p, b));
          return el("li", {}, b, ` · ${p.kind} · ${formatDateTime(p.created_at)}`);
        }))));
    }
    section.append(status, reportProblemButton(id, "T4/T5 proposal"));
    return section;
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
