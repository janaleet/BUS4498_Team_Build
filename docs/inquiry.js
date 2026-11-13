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
  let emails = [];
  let logRows = [];
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
    const [{ data: proposals }, { data: reviews }, { data: runs }, { data: emailRows }, { data: logs }] = await Promise.all([
      sb.from("proposals").select("*").eq("inquiry_id", id).order("version", { ascending: false }),
      sb.from("proposal_reviews").select("*").eq("inquiry_id", id).order("id", { ascending: false }),
      sb.from("revision_runs").select("*").eq("inquiry_id", id).order("id", { ascending: false }),
      sb.from("emails").select("*").eq("inquiry_id", id).order("id", { ascending: false }),
      sb.from("materials_log").select("*").eq("inquiry_id", id).order("id", { ascending: false }),
    ]);
    emails = emailRows || [];
    logRows = logs || [];
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
      if ((proposals || []).length) parts.push(reviewCard(inquiry, proposals || [], reviews || [], runs || []));
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
  /** Google Calendar result for the event's date and hours (Task 3). */
  function availabilityLine(a) {
    const AV = {
      free: ["sufficient", "Calendar: free"],
      booked: ["conflicting", "Calendar: date appears booked"],
      not_checked: ["missing", "Calendar: not checked"],
      not_configured: ["neutral", "Calendar: not connected"],
    }[a.availability || "not_checked"];
    return el("p", {}, el("span", { class: `badge ${AV[0]}`, text: AV[1] }), a.availability_note ? ` ${a.availability_note}` : "");
  }

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
      availabilityLine(a),
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

    /** Email an approved message to the signed-in employee (never to the client). */
    async function emailMessage(requestId) {
      const result = await callFunction("agent", { action: "email_message", request_id: requestId });
      message.append(notice(result.ok ? "ok" : "warn", result.ok ? "Emailed to you" : "Not emailed", (result.reasons || [result.error || ""]).join(" ") +
        (result.ok ? "" : " You can copy the message below instead.")));
      await load();
    }

    function emailFacts(r) {
      const kind = r.kind === "reminder" ? "reminder" : "clarification_request";
      const mine = emails.filter((e) => e.kind === kind && e.source_id === r.id);
      const sent = mine.find((e) => e.status === "sent");
      if (sent) return el("p", { class: "hint", text: `Emailed to ${who(sent.to_user)}'s inbox on ${formatDateTime(sent.sent_at)}.` });
      const failed = mine.find((e) => e.status === "failed");
      const button = el("button", { type: "button", class: "secondary", text: "Email it to me" });
      button.addEventListener("click", () => run(button, "Emailing…", () => emailMessage(r.id)));
      return el("div", {}, failed ? notice("warn", "Not emailed", failed.error || "") : "", el("div", { class: "actions" }, button));
    }

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
        approve.addEventListener("click", () => run(approve, "Approving…", async () => {
          const okSaved = await rpcAction("approve_clarification", { p_id: r.id, p_subject: subject.value, p_body: body.value },
            "Approved", "Forward it to the client from your own email with their name added, then click Mark as sent.");
          if (!okSaved) return;
          await emailMessage(r.id);
        }));
        const reject = el("button", { type: "button", class: "secondary", text: "Reject" });
        reject.addEventListener("click", () => {
          if (reason.value.trim().length < 3) {
            reason.focus();
            status.replaceChildren(notice("bad", "Add a reason", "Say why the draft isn't right (at least 3 characters)."));
            return;
          }
          run(reject, "Rejecting…", async () => {
            const okSaved = await rpcAction("reject_clarification", { p_id: r.id, p_reason: reason.value.trim() },
              "Rejected", "Choose Redraft to have the AI write a new draft using your reason, or write it from the checklist.");
            if (!okSaved) return;
            // The agent learns one lesson from the reason (memory plan).
            const learned = await callFunction("agent", { action: "learn_rejection", request_id: r.id });
            message.append(notice(learned.ok && learned.status === "learned" ? "ok" : "warn", "Lesson", (learned.reasons || [learned.error || ""]).join(" ")));
          });
        });
        if (r.skill_used) parts.push(el("p", { class: "hint", text: `Drafted by the AI following the Skill ${r.skill_used}.${(r.lessons_applied || []).length ? ` Lessons applied: ${r.lessons_applied.join(" · ")}` : ""}` }));
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
        parts.push(emailFacts(r),
          el("p", { text: "Forward it (or copy it) from your own email: add the client's name in place of [CLIENT NAME] and yours in place of [EMPLOYEE NAME]. Then click Mark as sent." }),
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
    const released = proposals.find((p) => p.status === "released");
    const current = released || proposals.find((p) => p.status === "draft");
    const section = el("section", { class: "card" }, el("h2", { style: "margin-top:0", text: "T4/T5 · Proposal" }));

    const download = async (p, button, name) => {
      button.disabled = true;
      const { data, error } = await sb.storage.from("proposals").createSignedUrl(p.file_path, 60, { download: name || `${id}-proposal-v${p.version}.docx` });
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
      const by = { code: "filled by code", ai: `tailored sections by ${current.model}`, by_hand: "tailored sections need writing by hand", employee_edit: `edited by ${who(current.edited_by)}`, revision: `revised by T7 (${current.model})` }[current.drafted_by];
      const dl = el("button", { type: "button", text: released ? "Download the final proposal (.docx)" : `Download .docx (version ${current.version})` });
      dl.addEventListener("click", () => download(current, dl, released ? `${id}-proposal-final.docx` : null));
      section.append(
        el("div", { class: "switch-row" }, kindBadge, released ? el("span", { class: "badge sufficient", text: "Released" }) : "",
          el("span", { class: "hint", text: `Version ${current.version}, ${by}, ${formatDateTime(current.created_at)} · revision round ${current.revision_round} of 2` })),
        released ? notice("ok", "Ready for release", `Released by ${who(current.released_by)} on ${formatDateTime(current.released_at)}. Download it, add the client's name and contact details and the venue's details in Word, and send it yourself. The app never sends proposals.`) : "",
        current.problems && current.problems.length && !released ? notice("warn", "Needs attention", current.problems.join(" ")) : "",
        el("div", { class: "actions" }, dl),
        released ? "" : el("p", { class: "hint", text: "Next: Task 6, review below. Before sending, the employee adds the client's name and the venue's details in Word." }),
        current.lessons_applied && current.lessons_applied.length
          ? el("details", {}, el("summary", { text: `Lessons applied (${current.lessons_applied.length})` }), el("ul", {}, current.lessons_applied.map((l) => el("li", { text: l }))))
          : "");
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

      // Edit the tailored sections by hand; code rebuilds the file (not once released).
      if (released) {
        const sentMail = emails.find((e) => e.kind === "proposal" && e.source_id === released.id && e.status === "sent");
        const written = logRows.find((l) => l.proposal_id === released.id && l.status === "written");
        const failedLog = logRows.find((l) => l.proposal_id === released.id && l.status === "failed");
        const mailButton = el("button", { type: "button", class: "secondary", text: "Email it to me" });
        mailButton.addEventListener("click", async () => {
          mailButton.disabled = true;
          const r = await callFunction("agent", { action: "email_proposal", proposal_id: released.id });
          message.replaceChildren(notice(r.ok ? "ok" : "warn", r.ok ? "Emailed to you" : "Not emailed", (r.reasons || [r.error || ""]).join(" ")));
          await load();
        });
        const logButton = el("button", { type: "button", class: "secondary", text: "Add to the materials log" });
        logButton.addEventListener("click", async () => {
          logButton.disabled = true;
          const r = await callFunction("agent", { action: "log_materials", proposal_id: released.id });
          message.replaceChildren(notice(r.ok ? "ok" : "warn", r.ok ? "Materials logged" : "Not logged", (r.reasons || [r.error || ""]).join(" ")));
          await load();
        });
        section.append(el("ul", { class: "plain" },
          el("li", {}, sentMail ? `Emailed to ${who(sentMail.to_user)}'s inbox on ${formatDateTime(sentMail.sent_at)}.` : "Not emailed yet. ", sentMail ? "" : mailButton),
          el("li", {}, written ? `In the Google Sheets materials log (${written.updated_range || "added"}).` : `Not in the materials log yet${failedLog ? `: ${failedLog.error}` : ""}. `, written ? "" : logButton)));
        const olderR = proposals.filter((p) => p !== current);
        if (olderR.length) section.append(el("p", { class: "hint", text: `${olderR.length} earlier version(s) are kept.` }));
        section.append(status, reportProblemButton(id, "T4/T5 proposal"));
        return section;
      }
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

  /**
   * T6 · Review and D3: the quality checklist and the three outcomes for the current draft
   * (a recorded click; D3 runs in the database), then the earlier reviews with what T7 did.
   */
  /** After release: email the file to the employee and add the materials-log row. */
  async function afterRelease(proposalId) {
    const [mail, log] = await Promise.all([
      callFunction("agent", { action: "email_proposal", proposal_id: proposalId }),
      callFunction("agent", { action: "log_materials", proposal_id: proposalId }),
    ]);
    message.append(
      notice(mail.ok ? "ok" : "warn", mail.ok ? "Emailed to you" : "Not emailed", (mail.reasons || [mail.error || ""]).join(" ")),
      notice(log.ok ? "ok" : "warn", log.ok ? "Materials logged" : "Not logged yet", (log.reasons || [log.error || ""]).join(" ")));
    await load();
  }

  function reviewCard(inquiry, proposals, reviews, runs) {
    const status = el("div");
    const section = el("section", { class: "card" }, el("h2", { style: "margin-top:0", text: "T6 · Review and D3 · Review outcome" }));
    const draft = proposals.find((p) => p.status === "draft");
    const released = proposals.find((p) => p.status === "released");
    const OUTCOME = { ready: "Ready for release", needs_revision: "Needs revision", needs_clarification: "Needs clarification" };
    const ROUTE = { release: "released", t7: "sent to T7 for revision", t2: "sent to T2 for a clarification request", coordinator: "stopped for the event coordinator (third Needs revision)" };
    const RUN = { revised: "Revised — ready for human review", blocked: "Blocked — clarification required", handoff: "Handed back to the reviewer" };
    const stopped = ["stopped_no_response", "stopped_coordinator_review"].includes(inquiry.status);

    const processReview = async (reviewId, button) => {
      if (button) { button.disabled = true; button.textContent = "Working (T7 can take a few minutes)…"; }
      const result = await callFunction("agent", { action: "process_review", review_id: reviewId });
      if (!result.ok) {
        status.replaceChildren(notice(result.status === "paused" ? "warn" : "bad", "Next step not run", result.error || (result.reasons || []).join(" ")));
        if (button) { button.disabled = false; button.textContent = "Run the next step"; }
        return;
      }
      message.replaceChildren(notice("ok", "Next step done", (result.reasons || []).join(" ")));
      await load();
    };

    if (inquiry.status === "stopped_coordinator_review") {
      section.append(notice("warn", "Stopped – coordinator review", "A third Needs revision came after 2 revision rounds. T7 did not run; the event coordinator decides what happens next."));
    }
    if (released) {
      section.append(notice("ok", "Released", "This proposal passed review. Download it from the proposal card above."));
    } else if (draft && !stopped && !reviews.some((r) => r.proposal_id === draft.id)) {
      const items = [
        ["sections_complete", "Every section is complete (event, room, tables, chairs, AV, setup)"],
        ["matches_event_details", "It matches the client's details (Required details below)"],
        ["matches_setup", "It matches the setup list (Setup needs card above)"],
        ["unresolved_visible", "Every unresolved item and assumption is shown"],
        ["no_personal_details", "No client names, email addresses, phone numbers or street addresses"],
      ];
      const boxes = {};
      const list = el("div", {});
      for (const [key, label] of items) {
        boxes[key] = el("input", { id: `chk-${key}`, type: "checkbox" });
        list.append(el("label", { class: "check", for: boxes[key].id }, boxes[key], el("span", { text: label })));
      }
      const comments = el("textarea", { id: "review-comments", class: "short", maxlength: "4000",
        placeholder: "What needs to change, or what to ask the client (one missing detail per line). No contact details." });
      const ready = el("button", { type: "button", text: "Ready for release", disabled: true });
      const revise = el("button", { type: "button", class: "secondary", text: "Needs revision" });
      const clarify = el("button", { type: "button", class: "secondary", text: "Needs clarification" });
      const allTicked = () => items.every(([k]) => boxes[k].checked);
      Object.values(boxes).forEach((b) => b.addEventListener("change", () => { ready.disabled = !allTicked(); }));
      const record = async (outcome, button) => {
        if (outcome !== "ready" && comments.value.trim().length < 3) {
          comments.focus();
          status.replaceChildren(notice("bad", "Add a reason", "Say what needs to change (at least 3 characters)."));
          return;
        }
        [ready, revise, clarify].forEach((b) => { b.disabled = true; });
        const checklist = Object.fromEntries(items.map(([k]) => [k, boxes[k].checked]));
        const { data, error } = await sb.rpc("record_review", { p_proposal_id: draft.id, p_outcome: outcome, p_checklist: checklist, p_comments: comments.value });
        if (error) {
          status.replaceChildren(notice("bad", "Review not saved", error.message));
          [revise, clarify].forEach((b) => { b.disabled = false; });
          ready.disabled = !allTicked();
          return;
        }
        if (data.routed_to === "release") {
          message.replaceChildren(notice("ok", "Ready for release", "The final proposal is saved under this inquiry ID for download."));
          await afterRelease(draft.id);
          return;
        }
        message.replaceChildren(notice("ok", `Review saved: ${OUTCOME[outcome]}`, `D3: ${ROUTE[data.routed_to]}.`));
        await processReview(data.id, button);
      };
      ready.addEventListener("click", () => record("ready", ready));
      revise.addEventListener("click", () => record("needs_revision", revise));
      clarify.addEventListener("click", () => record("needs_clarification", clarify));
      section.append(
        el("p", { class: "hint", text: `Version ${draft.version} · revision round ${inquiry.revision_round} of 2 · waiting since ${formatDateTime(draft.created_at)}. Compare the proposal with the Setup needs card and the Required details on this page.` }),
        inquiry.revision_round >= 2 ? notice("warn", "Last revision round", "Another Needs revision stops this inquiry for the event coordinator; T7 won't run again.") : "",
        el("h3", { text: "Quality checklist" }), list,
        el("label", { for: comments.id, text: "Reason (needed for Needs revision or Needs clarification)" }), comments,
        el("div", { class: "actions" }, ready, revise, clarify),
        el("p", { class: "hint", text: "Ready for release needs every box ticked. Nothing is sent to the client." }));
    } else if (draft && !stopped) {
      section.append(el("p", { class: "hint", text: "This version has been reviewed. See below." }));
    }

    if (reviews.length) {
      section.append(el("h3", { text: "Reviews" }));
      for (const r of reviews) {
        const p = proposals.find((x) => x.id === r.proposal_id);
        const run = runs.find((x) => x.review_id === r.id);
        const item = el("div", { class: "card inset" },
          el("div", { class: "switch-row" },
            el("span", { class: `badge ${r.outcome === "ready" ? "sufficient" : r.outcome === "needs_revision" ? "conflicting" : "missing"}`, text: OUTCOME[r.outcome] }),
            el("span", { class: "hint", text: `Version ${p ? p.version : "?"} · round ${r.revision_round} · by ${who(r.reviewed_by)} on ${formatDateTime(r.reviewed_at)} · ${ROUTE[r.routed_to]}` })),
          r.comments ? el("p", { text: `"${r.comments}"` }) : "");
        if (!r.processed_at && !stopped) {
          const again = el("button", { type: "button", text: "Run the next step" });
          again.addEventListener("click", () => processReview(r.id, again));
          item.append(notice("warn", "Next step not run yet", "The review is saved, but the agent hasn't acted on it (it may have been paused)."), el("div", { class: "actions" }, again));
        }
        if (run) {
          item.append(el("h4", { text: `T7: ${RUN[run.status]}` }),
            el("ul", {},
              run.summary && run.summary !== "undetermined" ? el("li", { text: `Summary: ${run.summary}` }) : "",
              run.evidence ? el("li", { text: `Evidence: ${run.evidence}` }) : "",
              run.unresolved && run.unresolved.length ? el("li", { text: `Unresolved: ${run.unresolved.join(" ")}` }) : "",
              run.handoff_note && run.handoff_note !== "Not applicable" ? el("li", { text: `Handoff note: ${run.handoff_note}` }) : "",
              el("li", { text: `Subtasks: ${run.subtasks.join(", ") || "none"} · ${run.ai_calls} of 8 AI calls · ${Math.round(run.ms / 1000)} s` }),
              run.lessons_applied && run.lessons_applied.length ? el("li", { text: `Lessons applied: ${run.lessons_applied.join(" · ")}` }) : ""));
        }
        section.append(item);
      }
    }
    section.append(status, reportProblemButton(id, "T6 review and T7 revision"));
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
