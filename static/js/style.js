let polling = null;

async function refreshUploads() {
  const data = await api("/api/style/uploads");
  const csvStatus = document.getElementById("csv-status");
  const imagesStatus = document.getElementById("images-status");
  csvStatus.textContent = data.csv_uploaded
    ? `Uploaded — ${data.csv_row_count != null ? data.csv_row_count + " rows parsed" : "could not parse rows, check column names"}.`
    : "No CSV uploaded yet.";
  imagesStatus.textContent = `${data.image_count} image(s) uploaded.`;

  const summary = document.getElementById("analyze-summary");
  if (data.csv_uploaded && data.image_count > 0) {
    summary.textContent = `Ready — ${data.image_count} competitor image(s) available.`;
  } else {
    summary.textContent = "Upload a CSV and matching images above, then analyze.";
  }
}

document.getElementById("upload-btn").addEventListener("click", async () => {
  const csvFile = document.getElementById("csv-input").files[0];
  const imageFiles = document.getElementById("images-input").files;
  if (!csvFile && imageFiles.length === 0) {
    toast("Choose a CSV and/or images to upload first.", "error");
    return;
  }
  const form = new FormData();
  if (csvFile) form.append("csv", csvFile);
  for (const f of imageFiles) form.append("images", f);

  try {
    const result = await api("/api/style/upload", { method: "POST", body: form });
    toast(`Uploaded${result.csv_saved ? " CSV" : ""}${result.images_saved ? ` and ${result.images_saved} image(s)` : ""}.`, "success");
    await refreshUploads();
  } catch {
    /* toasted already */
  }
});

function renderProfile(profile) {
  const card = document.getElementById("profile-card");
  const body = document.getElementById("profile-body");
  card.style.display = "block";
  body.innerHTML = "";

  const section = (title, content) => {
    const wrap = el("div", { style: "margin-bottom:16px;" });
    wrap.appendChild(el("div", { style: "font-weight:700; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.02em; color:var(--ink-soft); margin-bottom:4px;" }, title));
    wrap.appendChild(content);
    return wrap;
  };
  const p = (text) => el("p", { style: "margin:0;" }, text);
  const tags = (items) => {
    const wrap = el("div", { style: "display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;" });
    for (const t of items || []) wrap.appendChild(el("span", { class: "badge neutral" }, t));
    return wrap;
  };

  if (profile.summary) body.appendChild(section("Overview", p(profile.summary)));
  if (profile.composition_style) body.appendChild(section("Composition Style", p(profile.composition_style)));
  if (profile.color_grading) body.appendChild(section("Color Grading", p(profile.color_grading)));
  if (profile.moment_types && profile.moment_types.length) body.appendChild(section("Recurring Moment Types", tags(profile.moment_types)));
  if (profile.caption_tone) body.appendChild(section("Caption Tone", p(profile.caption_tone)));
  if (profile.caption_length) body.appendChild(section("Typical Caption Length", p(profile.caption_length)));
  if (profile.common_hashtags && profile.common_hashtags.length) body.appendChild(section("Common Hashtags", tags(profile.common_hashtags)));

  const meta = [];
  if (profile._generated_from_post_count) meta.push(`Based on ${profile._generated_from_post_count} top-performing post(s).`);
  if (profile._missing_images && profile._missing_images.length) meta.push(`${profile._missing_images.length} CSV row(s) had no matching uploaded image and were skipped.`);
  if (profile._analysis_errors && profile._analysis_errors.length) meta.push(`${profile._analysis_errors.length} image(s) failed to analyze.`);
  if (meta.length) body.appendChild(el("div", { class: "muted", style: "margin-top:12px;" }, meta.join(" ")));
}

async function loadProfile() {
  const data = await api("/api/style/profile");
  if (data.exists) renderProfile(data.profile);
}

function renderStatus(status) {
  const summary = document.getElementById("analyze-summary");
  const progressWrap = document.getElementById("analyze-progress-wrap");
  const bar = document.getElementById("analyze-progress-fill");
  const message = document.getElementById("analyze-message");
  const p = status.progress || {};
  const btn = document.getElementById("analyze-btn");

  btn.disabled = status.status === "running";
  btn.textContent = status.status === "running" ? "Analyzing…" : "Analyze Style";

  if (status.status === "running") {
    progressWrap.style.display = "block";
    const total = p.total || 0;
    const done = p.completed || 0;
    bar.style.width = total ? `${Math.min(100, (done / total) * 100)}%` : "8%";
    message.textContent = p.message || "Working…";
  } else if (status.status === "error") {
    progressWrap.style.display = "none";
    message.textContent = "Failed: " + (status.error || "unknown error");
  } else {
    progressWrap.style.display = "none";
    if (status.status === "done") {
      summary.textContent = "Style profile is up to date.";
      message.textContent = p.message || "";
    }
  }
}

async function pollStatus() {
  const status = await api("/api/style/status");
  renderStatus(status);
  if (status.status === "running") {
    if (!polling) polling = setInterval(pollStatus, 1500);
  } else {
    if (polling) { clearInterval(polling); polling = null; }
    loadProfile();
  }
}

document.getElementById("analyze-btn").addEventListener("click", async () => {
  try {
    await api("/api/style/analyze", { method: "POST" });
    toast("Style analysis started.", "info");
    pollStatus();
  } catch {
    /* toasted already */
  }
});

refreshUploads();
pollStatus();
loadProfile();
