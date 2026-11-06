(async function () {
  const { el, notice, requireStaff, renderHeader, callFunction } = window.JEvents;
  const page = document.getElementById("page");
  const ctx = await requireStaff(page);
  renderHeader("new-inquiry.html", ctx);
  if (!ctx || !ctx.staff) return;

  const message = document.getElementById("message");
  const raw = document.getElementById("raw");
  const step2 = document.getElementById("step-2");
  const cleaned = document.getElementById("cleaned");
  const confirm = document.getElementById("confirm");
  const checkButton = document.getElementById("check");
  const submitButton = document.getElementById("submit");
  const byHandButton = document.getElementById("by-hand");

  function resetStep2() {
    step2.hidden = true;
    confirm.checked = false;
    updateButtons();
  }
  function updateButtons() {
    const ready = confirm.checked && cleaned.value.trim() !== "";
    submitButton.disabled = !ready;
    byHandButton.disabled = !ready;
  }

  raw.addEventListener("input", resetStep2);
  confirm.addEventListener("change", updateButtons);
  cleaned.addEventListener("input", updateButtons);

  checkButton.addEventListener("click", async () => {
    message.replaceChildren();
    if (raw.value.trim() === "") {
      message.replaceChildren(notice("bad", "The inquiry is empty", "Paste the inquiry text first."));
      return;
    }
    checkButton.disabled = true;
    checkButton.textContent = "Checking…";
    const result = await callFunction("agent", { action: "preview", text: raw.value });
    checkButton.disabled = false;
    checkButton.textContent = "Check for personal details";
    if (!result.ok) {
      message.replaceChildren(notice("bad", "Not checked", result.error || (result.reasons || []).join(" ")));
      return;
    }
    cleaned.value = result.text;
    const labels = { NAME: "Names", EMAIL: "Email addresses", PHONE: "Phone numbers", ADDRESS: "Street addresses" };
    document.getElementById("counts").replaceChildren(...Object.entries(labels).map(([key, label]) =>
      el("li", {}, el("span", { class: "badge neutral", text: `${label}: ${result.replaced[key] || 0}` }))));
    document.getElementById("warnings").replaceChildren(
      // Skip the "no names found" warning when the text already uses [NAME] placeholders.
      ...(result.warnings || [])
        .filter((w) => !(/No client names were found/.test(w) && /\[NAME\]/.test(result.text)))
        .map((w) => notice("warn", "Check by eye", w)),
      ...(result.flags || []).map((line) => notice("warn", "This line tries to instruct the agent",
        `"${line}" — it will be flagged for a person and not followed.`)));
    confirm.checked = false;
    step2.hidden = false;
    updateButtons();
    step2.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  async function submit(byHand) {
    message.replaceChildren();
    submitButton.disabled = true;
    byHandButton.disabled = true;
    const button = byHand ? byHandButton : submitButton;
    const original = button.textContent;
    button.textContent = byHand ? "Saving…" : "Reading the inquiry (up to a minute)…";
    const result = await callFunction("agent", {
      action: "submit", text: cleaned.value, confirmed: confirm.checked, by_hand: byHand,
    });
    button.textContent = original;
    if (!result.ok) {
      updateButtons();
      const title = result.status === "paused" ? "The agent is paused" : "Not submitted";
      message.replaceChildren(notice("bad", title, result.error || (result.reasons || []).join(" ")));
      return;
    }
    location.href = `inquiry.html?id=${encodeURIComponent(result.inquiry_id)}`;
  }
  submitButton.addEventListener("click", () => submit(false));
  byHandButton.addEventListener("click", () => submit(true));
})();
