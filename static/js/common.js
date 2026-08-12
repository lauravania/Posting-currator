// Shared helpers used by every page: toasts, a fetch wrapper that always
// surfaces errors instead of failing silently, and small DOM utilities.

function toast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), type === "error" ? 7000 : 4000);
}

/**
 * Wraps fetch(): parses JSON, and on any failure (network error, non-2xx
 * status, or an {"error": "..."} body) shows a toast and throws so callers
 * can stop whatever they were doing rather than proceeding on bad data.
 */
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json", ...(options.headers || {}) }
        : (options.headers || {}),
      ...options,
    });
  } catch (err) {
    toast(`Network error calling ${path}: ${err.message}`, "error");
    throw err;
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message = (data && data.error) || `Request to ${path} failed (${response.status})`;
    toast(message, "error");
    throw new Error(message);
  }
  return data;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
