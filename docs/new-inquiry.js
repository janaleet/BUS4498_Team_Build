(async function () {
  const { el, notice, requireStaff, renderHeader, callFunction } = window.JEvents;
  const page = document.getElementById("page");
  const ctx = await requireStaff(page);
  renderHeader("new-inquiry.html", ctx);
  if (!ctx || !ctx.staff) return;
  if (ctx.staff.role !== "employee") {
    page.replaceChildren(notice("warn", "Employees only", "Only employees can submit inquiries. You can still view every inquiry on the dashboard."));
    return;
  }

  const message = document.getElementById("message");
  const raw = document.getElementById("raw");
  const file = document.getElementById("file");
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

  file.addEventListener("change", () => {
    const chosen = file.files[0];
    message.replaceChildren();
    if (!chosen) return;
    if (chosen.size > 100 * 1024) {
      message.replaceChildren(notice("bad", "File too large", "Choose a text file under 100 KB."));
      file.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { raw.value = String(reader.result); resetStep2(); };
    reader.onerror = () => message.replaceChildren(notice("bad", "Could not read the file", "Paste the text instead."));
    reader.readAsText(chosen);
  });
  raw.addEventListener("input", resetStep2);
  confirm.addEventListener("change", updateButtons);
  cleaned.addEventListener("input", updateButtons);

  checkButton.addEventListener("click", async () => {
    message.replaceChildren();
    if (raw.value.trim() === "") {
      message.replaceChildren(notice("bad", "The inquiry is empty", "Paste or upload the inquiry text first."));
      return;
    }
    checkButton.disabled = true;
    checkButton.textContent = "Checking…";
    const result = await callFunction("intake-inquiry", { action: "preview", text: raw.value });
    checkButton.disabled = false;
    checkButton.textContent = "Check for personal details";
    if (!result.ok) {
      message.replaceChildren(notice("bad", "Not checked", result.error));
      return;
    }
    cleaned.value = result.text;
    const labels = { NAME: "Names", EMAIL: "Email addresses", PHONE: "Phone numbers", ADDRESS: "Street addresses" };
    document.getElementById("counts").replaceChildren(...Object.entries(labels).map(([key, label]) =>
      el("li", {}, el("span", { class: "badge neutral", text: `${label}: ${result.replaced[key] || 0}` }))));
    document.getElementById("warnings").replaceChildren(...(result.warnings || []).map((w) => notice("warn", "Check by eye", w)));
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
    const result = await callFunction("intake-inquiry", {
      action: "submit", text: cleaned.value, confirmed: confirm.checked, by_hand: byHand,
    });
    button.textContent = original;
    if (!result.ok) {
      updateButtons();
      message.replaceChildren(notice("bad", "Not submitted", result.error));
      return;
    }
    location.href = `inquiry.html?id=${encodeURIComponent(result.inquiry_id)}`;
  }
  submitButton.addEventListener("click", () => submit(false));
  byHandButton.addEventListener("click", () => submit(true));
})();
