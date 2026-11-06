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
      t2_clarification: "Task 2 – ask the client for missing details (coming in Group 2)",
      t3_setup_needs: "Task 3 – work out setup needs (coming in Group 3)",
    },
    role: { employee: "Employee", reviewer: "Reviewer", coordinator: "Event coordinator" },
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
    const { data: staff, error } = await sb.from("staff_members").select("display_name, role").maybeSingle();
    if (error || !staff) {
      target.replaceChildren(notice("bad", "No staff role",
        "You are signed in, but no staff role is set for your account. Ask the project owner to add you."));
      return { user: data.session.user, staff: null };
    }
    return { user: data.session.user, staff };
  }

  function renderHeader(current, ctx) {
    const header = document.querySelector("header.top .inner");
    if (!header) return;
    const link = (href, text) => el("a", { href, "aria-current": current === href ? "page" : null, text });
    const nav = el("nav", { "aria-label": "Main" }, link("dashboard.html", "Dashboard"),
      ctx && ctx.staff && ctx.staff.role === "employee" ? link("new-inquiry.html", "New inquiry") : null);
    const who = ctx && ctx.user
      ? el("span", { class: "who" },
          `${ctx.user.email}${ctx.staff ? ` · ${LABELS.role[ctx.staff.role] || ctx.staff.role}` : ""} · `,
          el("button", { class: "link", type: "button", onclick: signOut, text: "Sign out" }))
      : null;
    header.replaceChildren(el("a", { class: "brand", href: "dashboard.html", text: "JEvents Proposals" }), nav, who);
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

  window.JEvents = { sb, connected, LABELS, el, notice, formatDateTime, requireStaff, renderHeader, callFunction, showNotConnected };
})();
