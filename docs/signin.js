(async function () {
  const { sb, notice, showNotConnected } = window.JEvents;
  const message = document.getElementById("message");
  const form = document.getElementById("sign-in");
  if (!sb) {
    showNotConnected(message);
    form.hidden = true;
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) location.replace("dashboard.html");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("submit");
    button.disabled = true;
    message.replaceChildren();
    const { error } = await sb.auth.signInWithPassword({
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
    });
    button.disabled = false;
    if (error) {
      message.replaceChildren(notice("bad", "Sign-in failed", "Check your email and password and try again."));
      return;
    }
    location.replace("dashboard.html");
  });
})();
