async function saveSettings() {
  const body = {
    dropbox_app_key: document.getElementById("dropbox_app_key").value,
    dropbox_app_secret: document.getElementById("dropbox_app_secret").value,
    dropbox_shared_folder_link: document.getElementById("dropbox_shared_folder_link").value,
    anthropic_api_key: document.getElementById("anthropic_api_key").value,
  };
  // Don't overwrite a saved secret with a blank field just because the
  // password input was left empty on this save.
  if (!body.dropbox_app_secret) delete body.dropbox_app_secret;
  if (!body.anthropic_api_key) delete body.anthropic_api_key;

  try {
    await api("/api/settings", { method: "POST", body: JSON.stringify(body) });
    toast("Settings saved.", "success");
  } catch {
    // api() already showed a toast
  }
}

document.getElementById("save-btn").addEventListener("click", saveSettings);
document.getElementById("save-btn-2").addEventListener("click", saveSettings);

document.getElementById("connect-btn").addEventListener("click", async () => {
  const appKey = document.getElementById("dropbox_app_key").value.trim();
  if (!appKey) {
    toast("Save your Dropbox App Key and Secret first.", "error");
    return;
  }
  // Make sure the fields on screen are actually saved before we start the
  // OAuth flow, otherwise "start" will fail with a config error.
  await saveSettings();
  const popup = window.open(
    "/api/dropbox/oauth/start",
    "dropbox_oauth",
    "width=520,height=720"
  );
  if (!popup) {
    toast("Please allow popups for this site to connect Dropbox.", "error");
  }
});

window.addEventListener("message", (event) => {
  if (event.data === "dropbox-oauth-success") {
    toast("Dropbox connected!", "success");
    setTimeout(() => window.location.reload(), 600);
  } else if (event.data && event.data.type === "dropbox-oauth-error") {
    toast(event.data.message || "Dropbox connection failed.", "error");
  }
});
