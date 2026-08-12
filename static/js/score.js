let polling = null;
let currentResults = [];

function techBadges(tech) {
  const badges = [];
  if (!tech || tech.error) return badges;
  if (tech.is_blurry) badges.push(["bad", `Blurry (${tech.blur_variance})`]);
  if (tech.is_underexposed) badges.push(["warn", "Underexposed"]);
  if (tech.is_overexposed) badges.push(["warn", "Overexposed"]);
  if (tech.faces_detected > 0 && tech.eyes_open_ratio != null && tech.eyes_open_ratio < 1) {
    badges.push(["warn", `Eyes closed? (${tech.eyes_open_count}/${tech.faces_detected})`]);
  }
  if (!badges.length) badges.push(["good", "Technically clean"]);
  return badges;
}

function renderGrid() {
  const grid = document.getElementById("score-grid");
  grid.innerHTML = "";
  document.getElementById("score-empty").style.display = currentResults.length ? "none" : "block";

  const included = currentResults.filter((r) => r.included).length;
  document.getElementById("included-count").textContent = included;
  document.getElementById("total-count").textContent = currentResults.length;

  for (const r of currentResults) {
    const card = el("div", {
      class: `score-card ${r.included ? "included" : "excluded"}`,
      onclick: () => toggleInclude(r.filename),
    });
    const thumbWrap = el("div", { class: "thumb-wrap" }, [
      el("img", { src: r.thumb_url, loading: "lazy", alt: r.filename }),
      r.score != null ? el("div", { class: "score-pill" }, `${r.score}/10`) : null,
    ]);
    const body = el("div", { class: "body" }, [
      el("div", { class: "filename" }, r.filename),
      el("div", { class: "reasoning" }, r.reasoning || "(no reasoning available)"),
      el("div", { class: "tech-flags" }, techBadges(r.technical).map(([kind, text]) => el("span", { class: `badge ${kind}` }, text))),
    ]);
    card.appendChild(thumbWrap);
    card.appendChild(body);
    grid.appendChild(card);
  }
}

async function toggleInclude(filename) {
  const row = currentResults.find((r) => r.filename === filename);
  if (!row) return;
  const next = !row.included;
  row.included = next; // optimistic update
  renderGrid();
  try {
    await api("/api/score/toggle", { method: "POST", body: JSON.stringify({ filename, included: next }) });
  } catch {
    row.included = !next; // revert on failure
    renderGrid();
  }
}

async function loadResults() {
  const data = await api("/api/score/results");
  currentResults = data.photos || [];
  renderGrid();
}

function renderStatus(status) {
  const summary = document.getElementById("score-summary");
  const progressWrap = document.getElementById("score-progress-wrap");
  const bar = document.getElementById("score-progress-fill");
  const message = document.getElementById("score-message");
  const p = status.progress || {};
  const btn = document.getElementById("score-btn");

  btn.disabled = status.status === "running";
  btn.textContent = status.status === "running" ? "Scoring…" : "Run Scoring";

  if (status.status === "running") {
    summary.textContent = "Scoring in progress…";
    progressWrap.style.display = "block";
    const total = p.total || 0;
    const done = p.completed || 0;
    bar.style.width = total ? `${Math.min(100, (done / total) * 100)}%` : "8%";
    message.textContent = p.message || "Working…";
  } else if (status.status === "error") {
    summary.textContent = "Last scoring run failed.";
    progressWrap.style.display = "none";
    message.textContent = status.error || "Unknown error.";
  } else {
    progressWrap.style.display = "none";
    summary.textContent = status.status === "done" ? "Scoring complete." : "Ready to score.";
    message.textContent = p.message || "";
  }
}

async function pollStatus() {
  const status = await api("/api/score/status");
  renderStatus(status);
  if (status.status === "running") {
    if (!polling) polling = setInterval(pollStatus, 1500);
  } else {
    if (polling) { clearInterval(polling); polling = null; }
    loadResults();
  }
}

document.getElementById("score-btn").addEventListener("click", async () => {
  try {
    await api("/api/score/start", { method: "POST" });
    toast("Scoring started.", "info");
    pollStatus();
  } catch {
    /* toasted already */
  }
});

document.getElementById("confirm-btn").addEventListener("click", async () => {
  try {
    const result = await api("/api/score/confirm", { method: "POST" });
    toast(`Copied ${result.copied} photo(s) to data/selected_photos/.`, "success");
  } catch {
    /* toasted already */
  }
});

pollStatus();
loadResults();
