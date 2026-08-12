const fetchBtn = document.getElementById("fetch-btn");
let polling = null;

async function loadGallery() {
  const data = await api("/api/fetch/gallery");
  document.getElementById("gallery-count").textContent = data.count;
  document.getElementById("gallery-empty").style.display = data.count ? "none" : "block";
  const gallery = document.getElementById("gallery");
  gallery.innerHTML = "";
  for (const photo of data.photos) {
    gallery.appendChild(
      el("figure", {}, el("img", { src: photo.thumb_url, loading: "lazy", alt: photo.filename }))
    );
  }
}

function renderStatus(status) {
  const summary = document.getElementById("fetch-summary");
  const progressWrap = document.getElementById("progress-wrap");
  const bar = document.getElementById("progress-bar-fill");
  const message = document.getElementById("fetch-message");
  const errorsBox = document.getElementById("fetch-errors");
  const p = status.progress || {};

  fetchBtn.disabled = status.status === "running";
  fetchBtn.textContent = status.status === "running" ? "Fetching…" : "Fetch Photos";

  if (status.status === "running") {
    summary.textContent = "Fetch in progress…";
    progressWrap.style.display = "block";
    const total = p.total || 0;
    const done = (p.downloaded || 0) + (p.skipped || 0) + (p.failed || 0);
    bar.style.width = total ? `${Math.min(100, (done / total) * 100)}%` : "8%";
    message.textContent = p.message || "Working…";
  } else if (status.status === "error") {
    summary.textContent = "Last fetch failed.";
    progressWrap.style.display = "none";
    message.textContent = status.error || "Unknown error.";
  } else if (status.status === "done") {
    summary.textContent = "Up to date.";
    progressWrap.style.display = "none";
    message.textContent = p.message || "";
  } else {
    summary.textContent = "Ready to fetch.";
    progressWrap.style.display = "none";
    message.textContent = "";
  }

  errorsBox.innerHTML = "";
  if (p.failed_files && p.failed_files.length) {
    const list = el("div", { class: "muted" }, `${p.failed} file(s) failed to download:`);
    errorsBox.appendChild(list);
    for (const f of p.failed_files) errorsBox.appendChild(el("div", { class: "muted" }, "• " + f));
  }
}

async function pollStatus() {
  const status = await api("/api/fetch/status");
  renderStatus(status);
  if (status.status === "running") {
    if (!polling) polling = setInterval(pollStatus, 1200);
  } else {
    if (polling) { clearInterval(polling); polling = null; }
    loadGallery();
  }
}

fetchBtn.addEventListener("click", async () => {
  try {
    await api("/api/fetch/start", { method: "POST" });
    toast("Fetch started.", "info");
    pollStatus();
  } catch {
    /* toasted already */
  }
});

pollStatus();
loadGallery();
