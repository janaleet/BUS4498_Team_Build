// Shared code for every page: the Supabase connection, sign-in checks, the page
// header, and small helpers. Client text is always shown with textContent.
(function () {
  const cfg = window.JEVENTS_CONFIG || {};
  const connected = /^https:\/\//.test(cfg.supabaseUrl || "") && /^sb_publishable_/.test(cfg.publishableKey || "");
  const sb = connected ? window.supabase.createClient(cfg.supabaseUrl, cfg.publishableKey) : null;

  const LABELS = {
    fields: {
      event_type: "Event type",
      event_date: "Event date",
      start_time: "Start time",
      end_time: "End time",
      guest_count: "Guest count",
      preferred_layout: "Preferred layout",
      room_preference: "Room preference",
      av_requests: "AV requests",
      catering: "Catering",
      special_requests: "Special requests",
      budget: "Budget",
    },
    status: {
      in_progress: "In progress",
      waiting_for_client: "Waiting for client",
      ready: "Ready",
      stopped_no_response: "Stopped – no response",
      stopped_coordinator_review: "Stopped – coordinator review",
    },
    nextStep: {
      extracting: "Reading the inquiry",
      enter_details_by_hand: "Enter the details by hand",
      t2_clarification: "Task 2 – ask the client for missing details (coming in Group 3)",
      t3_setup_needs: "Task 3 – work out setup needs (coming in Group 2)",
    },
  };

  /** Build an element. Text children are added as text, never as HTML. */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child === undefined || child === null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function notice(kind, title, body) {
    return el("div", { class: `notice ${kind}`, role: kind === "bad" ? "alert" : "status" },
      el("strong", { text: title }), body ? el("span", { text: body }) : null);
  }

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function showNotConnected(target) {
    target.replaceChildren(notice("warn", "Not connected to Supabase yet",
      "Add the Project URL and publishable key to docs/config.js, then reload this page."));
  }

  /** Redirect to sign-in unless a staff member is signed in. Returns { user, staff }. */
  async function requireStaff(target) {
    if (!sb) {
      showNotConnected(target);
      return null;
    }
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      location.replace("index.html");
      return null;
    }
    const user = data.session.user;
    const { data: staff, error } = await sb.from("staff_members")
      .select("display_name, is_owner").eq("user_id", user.id).maybeSingle();
    if (error || !staff) {
      target.replaceChildren(notice("bad", "Not on the staff list",
        "You are signed in, but your account is not on the staff list. Ask the project owner to add you."));
      return { user, staff: null };
    }
    await showPausedBanner();
    return { user, staff };
  }

  /** Read one setting row (signed-in staff only). */
  async function readSetting(key) {
    const { data } = await sb.from("settings").select("key, label, value, reason, changed_at").eq("key", key).maybeSingle();
    return data;
  }

  /** Show a banner on every page while the agent is paused. */
  async function showPausedBanner() {
    const paused = await readSetting("paused");
    const slot = document.getElementById("paused-banner") || (() => {
      const div = el("div", { id: "paused-banner" });
      const main = document.querySelector("main");
      if (main) main.prepend(div);
      return div;
    })();
    slot.replaceChildren(paused && paused.value === true
      ? notice("warn", "The agent is paused", `It does nothing and calls no AI until a reviewer switches Paused off in Settings. Reason: ${paused.reason}`)
      : "");
  }

  function renderHeader(current, ctx) {
    const header = document.querySelector("header.top .inner");
    if (!header) return;
    const link = (href, text) => el("a", { href, "aria-current": current === href ? "page" : null, text });
    const isStaff = ctx && ctx.staff;
    const nav = el("nav", { "aria-label": "Main" }, link("dashboard.html", "Dashboard"),
      isStaff ? link("new-inquiry.html", "New inquiry") : null,
      isStaff ? link("settings.html", "Settings") : null);
    const who = ctx && ctx.user
      ? el("span", { class: "who" },
          `${isStaff ? ctx.staff.display_name : ctx.user.email} · `,
          el("button", { class: "link", type: "button", onclick: signOut, text: "Sign out" }))
      : null;
    header.replaceChildren(el("a", { class: "brand", href: "dashboard.html", text: "JEvents Proposals" }), nav, who);
  }

  /**
   * "Report a problem" button for one decision. Saves the inquiry, what the report
   * is about, a note, who, and when. A report never changes a decision or a switch.
   */
  function reportProblemButton(inquiryId, about) {
    const button = el("button", { type: "button", class: "secondary small", text: "Report a problem" });
    button.addEventListener("click", () => {
      const status = el("div");
      const note = el("textarea", { id: `report-note-${inquiryId}`, class: "short", maxlength: "2000",
        placeholder: "What looks wrong? For example: the guest count should be 45, not 54." });
      const dialog = el("dialog", { class: "report", "aria-labelledby": "report-title" },
        el("h2", { id: "report-title", text: `Report a problem · ${inquiryId}` }),
        el("p", { class: "hint", text: `About: ${about}. A report doesn't change the decision; a reviewer reads it.` }),
        el("label", { for: note.id, text: "What's wrong" }), note, status,
        el("div", { class: "actions" },
          el("button", { type: "button", text: "Send report", onclick: async (event) => {
            const send = event.currentTarget;
            if (note.value.trim().length < 3) {
              status.replaceChildren(notice("bad", "Add a short note", "Say what looks wrong (at least 3 characters)."));
              return;
            }
            send.disabled = true;
            const { error } = await sb.from("problem_reports").insert({ inquiry_id: inquiryId, about, note: note.value.trim() });
            send.disabled = false;
            if (error) {
              status.replaceChildren(notice("bad", "Not saved", "Try again. If it keeps failing, tell your teammate."));
              return;
            }
            dialog.close();
            dialog.remove();
            button.replaceWith(el("span", { class: "badge neutral", text: "Problem reported" }));
          } }),
          el("button", { type: "button", class: "secondary", text: "Cancel", onclick: () => { dialog.close(); dialog.remove(); } })));
      document.body.append(dialog);
      dialog.showModal();
      note.focus();
    });
    return button;
  }

  async function signOut() {
    if (sb) await sb.auth.signOut();
    location.replace("index.html");
  }

  /** Call an Edge Function with the publishable key and the user's sign-in token. */
  async function callFunction(name, body) {
    const { data } = await sb.auth.getSession();
    const token = data.session ? data.session.access_token : "";
    let response;
    try {
      response = await fetch(`${cfg.supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: { apikey: cfg.publishableKey, "Content-Type": "application/json", "x-user-token": token },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: "Could not reach the server. Check your connection and try again." };
    }
    let result;
    try {
      result = await response.json();
    } catch {
      result = { ok: false, error: `The server returned an error (${response.status}).` };
    }
    if (response.status === 401) {
      location.replace("index.html");
    }
    return result;
  }

  window.JEvents = {
    sb, connected, LABELS, el, notice, formatDateTime, requireStaff, renderHeader, callFunction,
    showNotConnected, readSetting, showPausedBanner, reportProblemButton,
  };
})();
