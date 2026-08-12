let polling = null;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function hashtagsToText(tags) {
  return (tags || []).join(" ");
}

function renderPostingSlot(slot) {
  const card = document.getElementById("posting-slot-card");
  const body = document.getElementById("posting-slot-body");
  if (!slot) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";
  body.innerHTML = "";
  body.appendChild(el("div", { style: "font-size:1.1rem; font-weight:700;" }, `${slot.day} at ${slot.time}`));
  body.appendChild(el("div", { class: "muted", style: "margin-top:4px;" }, slot.note || ""));
}

function captionCard(photo) {
  const card = el("div", { class: "caption-card" });
  const thumb = el("div", { class: "thumb" }, el("img", { src: photo.thumb_url, loading: "lazy", alt: photo.filename }));
  const thumbCol = el("div", {}, [thumb, el("div", { class: "filename" }, photo.filename)]);

  const captionInput = el("textarea", { rows: 3 });
  captionInput.value = photo.caption || "";

  const hashtagsInput = el("input", { type: "text" });
  hashtagsInput.value = hashtagsToText(photo.hashtags);

  const altInput = el("textarea", { rows: 2 });
  altInput.value = photo.alt_text || "";

  const daySelect = el("select");
  for (const day of DAYS) {
    const opt = el("option", { value: day, text: day });
    if (day === photo.suggested_day) opt.selected = true;
    daySelect.appendChild(opt);
  }

  const timeInput = el("input", { type: "time" });
  timeInput.value = photo.suggested_time || "18:00";

  const save = async () => {
    try {
      await api("/api/captions/update", {
        method: "POST",
        body: JSON.stringify({
          filename: photo.filename,
          caption: captionInput.value,
          hashtags: hashtagsInput.value,
          alt_text: altInput.value,
          suggested_day: daySelect.value,
          suggested_time: timeInput.value,
        }),
      });
    } catch {
      /* toasted already */
    }
  };
  for (const input of [captionInput, hashtagsInput, altInput, daySelect, timeInput]) {
    input.addEventListener("change", save);
  }

  const fields = el("div", {}, [
    el("div", { class: "field" }, [el("label", { text: "Caption" }), captionInput]),
    el("div", { class: "field" }, [
      el("label", { text: "Hashtags" }), hashtagsInput,
      el("div", { class: "hashtag-input-hint" }, "Space or comma separated"),
    ]),
    el("div", { class: "field" }, [el("label", { text: "Alt Text" }), altInput]),
    el("div", { class: "row" }, [
      el("div", { class: "field", style: "flex:1;" }, [el("label", { text: "Suggested Day" }), daySelect]),
      el("div", { class: "field", style: "flex:1;" }, [el("label", { text: "Suggested Time" }), timeInput]),
    ]),
    photo.error ? el("div", { class: "badge bad" }, `Caption generation error: ${photo.error}`) : null,
  ]);

  card.appendChild(thumbCol);
  card.appendChild(fields);
  return card;
}

async function loadResults() {
  const data = await api("/api/captions/results");
  const list = document.getElementById("caption-list");
  list.innerHTML = "";
  const photos = data.photos || [];
  document.getElementById("captions-empty").style.display = photos.length ? "none" : "block";
  renderPostingSlot(data.posting_slot);
  for (const photo of photos) list.appendChild(captionCard(photo));
}

function renderStatus(status) {
  const summary = document.getElementById("captions-summary");
  const progressWrap = document.getElementById("captions-progress-wrap");
  const bar = document.getElementById("captions-progress-fill");
  const message = document.getElementById("captions-message");
  const p = status.progress || {};
  const btn = document.getElementById("generate-btn");

  btn.disabled = status.status === "running";
  btn.textContent = status.status === "running" ? "Generating…" : "Generate Captions";

  if (status.status === "running") {
    summary.textContent = "Generating captions…";
    progressWrap.style.display = "block";
    const total = p.total || 0;
    const done = p.completed || 0;
    bar.style.width = total ? `${Math.min(100, (done / total) * 100)}%` : "8%";
    message.textContent = p.message || "Working…";
  } else if (status.status === "error") {
    summary.textContent = "Last caption run failed.";
    progressWrap.style.display = "none";
    message.textContent = status.error || "Unknown error.";
  } else {
    progressWrap.style.display = "none";
    summary.textContent = status.status === "done" ? "Captions ready." : "Ready to generate.";
    message.textContent = p.message || "";
  }
}

async function pollStatus() {
  const status = await api("/api/captions/status");
  renderStatus(status);
  if (status.status === "running") {
    if (!polling) polling = setInterval(pollStatus, 1500);
  } else {
    if (polling) { clearInterval(polling); polling = null; }
    loadResults();
  }
}

document.getElementById("generate-btn").addEventListener("click", async () => {
  try {
    await api("/api/captions/generate", { method: "POST" });
    toast("Caption generation started.", "info");
    pollStatus();
  } catch {
    /* toasted already */
  }
});

document.getElementById("save-btn").addEventListener("click", async () => {
  try {
    const result = await api("/api/captions/save", { method: "POST" });
    toast(`Saved ${result.photo_count} photo(s) to output/results.json.`, "success");
  } catch {
    /* toasted already */
  }
});

pollStatus();
loadResults();
