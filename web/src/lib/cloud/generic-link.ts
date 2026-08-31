import type { CloudImage, CloudDownload } from "./types";

/**
 * Best-effort import from a link this app has no dedicated API integration
 * for — Pixieset, Apple Shared Albums, SmugMug, Zenfolio, a photographer's
 * own site, or anything else. Unlike Google Drive/Dropbox there's no
 * official API to call, so this reads the public page directly: fetch the
 * HTML server-side and pull out whatever photo URLs are actually present
 * in the markup (JSON-LD galleries, <img> tags, srcset, og:image).
 *
 * This is genuinely best-effort. Pages that render their gallery via
 * client-side JavaScript (common on Pixieset/SmugMug-style sites) won't
 * expose any images to a plain server-side fetch — that's a real
 * limitation, not something to paper over, so an empty result surfaces an
 * honest explanation rather than pretending photos were found.
 *
 * Password-protected galleries (also common on Pixieset) are handled by
 * detecting a standard <input type="password"> form on the page,
 * submitting the given password to it, and carrying the resulting session
 * cookie through the listing + every image download. Like the rest of
 * this module, this only works for a server-rendered password gate — a
 * gate implemented purely in client-side JS won't be visible here either.
 */

export class PasswordRequiredError extends Error {
  constructor(message = "This link is password protected.") {
    super(message);
    this.name = "PasswordRequiredError";
  }
}

export class IncorrectPasswordError extends Error {
  constructor(message = "That password wasn't accepted.") {
    super(message);
    this.name = "IncorrectPasswordError";
  }
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
const SKIP_FILENAME_HINTS = /(logo|icon|favicon|sprite|avatar|spacer|pixel|blank|placeholder|badge|button)/i;
const MAX_IMAGES = 300;
const FETCH_TIMEOUT_MS = 15_000;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
};

export function looksLikeUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function resolveUrl(candidate: string, base: URL): string | null {
  try {
    const resolved = candidate.startsWith("//") ? `${base.protocol}${candidate}` : candidate;
    const abs = new URL(resolved, base);
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return null;
    return abs.toString();
  } catch {
    return null;
  }
}

function isLikelyPhoto(absUrl: string): boolean {
  if (!IMAGE_EXTENSIONS.test(absUrl)) return false;
  const filename = absUrl.split("/").pop() ?? "";
  if (SKIP_FILENAME_HINTS.test(filename)) return false;
  return true;
}

function filenameFromUrl(absUrl: string, fallbackIndex: number): string {
  try {
    const pathname = new URL(absUrl).pathname;
    const last = pathname.split("/").filter(Boolean).pop();
    if (last && /\.[a-z]{3,4}$/i.test(last)) return decodeURIComponent(last);
  } catch {
    // fall through
  }
  return `photo-${fallbackIndex + 1}.jpg`;
}

function mimeTypeFromUrl(absUrl: string): string {
  const match = absUrl.match(IMAGE_EXTENSIONS);
  const ext = (match?.[1] ?? "jpg").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "avif") return "image/avif";
  return "image/jpeg";
}

/** Pulls contentUrl/url strings out of any JSON-LD blocks on the page (some gallery platforms embed an ImageGallery/ImageObject schema for SEO). */
function extractJsonLdImageUrls(html: string): string[] {
  const urls: string[] = [];
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      const stack = [...nodes];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        for (const [key, value] of Object.entries(node)) {
          if ((key === "contentUrl" || key === "url" || key === "image") && typeof value === "string") {
            urls.push(value);
          } else if (Array.isArray(value)) {
            stack.push(...value);
          } else if (value && typeof value === "object") {
            stack.push(value);
          }
        }
      }
    } catch {
      // Not valid JSON — ignore this block.
    }
  }
  return urls;
}

function extractImgTagUrls(html: string): string[] {
  const urls: string[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  const attrRe = /(?:src|data-src|data-lazy-src|data-original)\s*=\s*["']([^"']+)["']/i;
  const srcsetRe = /srcset\s*=\s*["']([^"']+)["']/i;

  for (const tag of html.match(imgRe) ?? []) {
    const srcMatch = tag.match(attrRe);
    if (srcMatch) urls.push(srcMatch[1]);
    const srcsetMatch = tag.match(srcsetRe);
    if (srcsetMatch) {
      for (const candidate of srcsetMatch[1].split(",")) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) urls.push(url);
      }
    }
  }
  return urls;
}

function extractOgImage(html: string): string[] {
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return match ? [match[1]] : [];
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

async function fetchWithTimeout(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Collects every Set-Cookie header from a response into one "name=value; name2=value2" string suitable for re-sending. */
function collectSetCookies(res: Response): string | null {
  const withGetSetCookie = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw =
    typeof withGetSetCookie.getSetCookie === "function"
      ? withGetSetCookie.getSetCookie()
      : (() => {
          const single = res.headers.get("set-cookie");
          return single ? [single] : [];
        })();
  if (raw.length === 0) return null;
  return raw.map((c) => c.split(";")[0]).join("; ");
}

function mergeCookies(...jars: (string | null)[]): string | null {
  const parts = jars.filter((j): j is string => Boolean(j));
  return parts.length ? parts.join("; ") : null;
}

type PasswordForm = { action: string; method: string; fields: Record<string, string>; passwordFieldName: string };

/** Looks for a standard HTML <form> containing a password input — the common shape of a server-rendered gallery password gate. */
function findPasswordForm(html: string): PasswordForm | null {
  const formRe = /<form\b[^>]*>[\s\S]*?<\/form>/gi;
  for (const formHtml of html.match(formRe) ?? []) {
    const passwordInputMatch = formHtml.match(/<input\b[^>]*type=["']password["'][^>]*>/i);
    if (!passwordInputMatch) continue;

    const nameMatch = passwordInputMatch[0].match(/\bname=["']([^"']+)["']/i);
    const passwordFieldName = nameMatch ? nameMatch[1] : "password";

    const openTagMatch = formHtml.match(/<form\b[^>]*>/i)?.[0] ?? "<form>";
    const actionMatch = openTagMatch.match(/\baction=["']([^"']*)["']/i);
    const methodMatch = openTagMatch.match(/\bmethod=["']([^"']+)["']/i);
    const action = actionMatch ? decodeEntities(actionMatch[1]) : "";
    const method = (methodMatch ? methodMatch[1] : "POST").toUpperCase();

    const fields: Record<string, string> = {};
    const inputRe = /<input\b[^>]*>/gi;
    for (const inputTag of formHtml.match(inputRe) ?? []) {
      const typeMatch = inputTag.match(/\btype=["']([^"']+)["']/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() : "text";
      if (type === "submit" || type === "button" || type === "reset" || type === "image") continue;
      const nMatch = inputTag.match(/\bname=["']([^"']+)["']/i);
      if (!nMatch) continue;
      if (type === "password") continue; // filled in by the caller with the real password
      const vMatch = inputTag.match(/\bvalue=["']([^"']*)["']/i);
      fields[nMatch[1]] = decodeEntities(vMatch ? vMatch[1] : "");
    }

    return { action, method, fields, passwordFieldName };
  }
  return null;
}

export type GenericResolved = { kind: "single"; image: CloudImage } | { kind: "gallery"; html: string; baseUrl: URL };

/**
 * Opens a link, submitting a password if the page is gated and one was
 * given. Throws PasswordRequiredError if the page needs a password we
 * don't have, or IncorrectPasswordError if the one given didn't work —
 * callers can use these to prompt the user distinctly from a generic
 * "couldn't open that link" failure.
 */
export async function resolveGenericLink(link: string, password?: string): Promise<{ resolved: GenericResolved; cookie: string | null }> {
  if (!looksLikeUrl(link)) throw new Error("That doesn't look like a valid link.");

  const firstRes = await fetchWithTimeout(link, BROWSER_HEADERS);
  if (!firstRes.ok) {
    throw new Error(`Couldn't open that page (${firstRes.status}). Check the link is public and try again.`);
  }

  const contentType = firstRes.headers.get("content-type") ?? "";

  // The pasted link is itself a single hosted photo, not a gallery page —
  // no password wall to worry about.
  if (contentType.startsWith("image/")) {
    const absUrl = firstRes.url;
    const name = filenameFromUrl(absUrl, 0);
    return {
      resolved: { kind: "single", image: { id: absUrl, name, mimeType: contentType, sizeBytes: null, thumbnailUrl: absUrl } },
      cookie: null,
    };
  }
  if (!contentType.includes("text/html")) {
    throw new Error("That link doesn't point to a web page or photo this app can read.");
  }

  const firstHtml = await firstRes.text();
  let cookie = collectSetCookies(firstRes);
  const form = findPasswordForm(firstHtml);

  if (!form) {
    // No password wall detected — proceed with what we already fetched.
    return { resolved: { kind: "gallery", html: firstHtml, baseUrl: new URL(firstRes.url) }, cookie };
  }
  if (!password) {
    throw new PasswordRequiredError();
  }

  const actionUrl = resolveUrl(form.action, new URL(firstRes.url)) ?? firstRes.url;
  const body = new URLSearchParams({ ...form.fields, [form.passwordFieldName]: password });

  const submitHeaders: Record<string, string> = { ...BROWSER_HEADERS, "Content-Type": "application/x-www-form-urlencoded" };
  if (cookie) submitHeaders.Cookie = cookie;

  // redirect: "manual" — fetch's automatic redirect-following only exposes
  // the *final* response's headers, which would silently drop the
  // Set-Cookie a password-check response sets on its redirect. Following
  // it ourselves lets us carry that cookie into the next request.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let submitRes: Response;
  try {
    submitRes = await fetch(actionUrl, {
      method: form.method === "GET" ? "GET" : "POST",
      headers: submitHeaders,
      body: form.method === "GET" ? undefined : body,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  cookie = mergeCookies(cookie, collectSetCookies(submitRes));

  let resultHtml: string;
  let resultUrl: string;
  const location = submitRes.status >= 300 && submitRes.status < 400 ? submitRes.headers.get("location") : null;
  if (location) {
    const nextUrl = resolveUrl(location, new URL(actionUrl)) ?? link;
    const followRes = await fetchWithTimeout(nextUrl, cookie ? { ...BROWSER_HEADERS, Cookie: cookie } : BROWSER_HEADERS);
    cookie = mergeCookies(cookie, collectSetCookies(followRes));
    resultHtml = await followRes.text();
    resultUrl = followRes.url;
  } else {
    resultHtml = await submitRes.text();
    resultUrl = submitRes.url;
  }

  // If we still don't have the gallery (e.g. the submit response was a
  // plain confirmation page rather than a redirect), re-fetch the
  // original link with whatever cookie we've collected so far.
  if (findPasswordForm(resultHtml)) {
    const retryRes = await fetchWithTimeout(link, cookie ? { ...BROWSER_HEADERS, Cookie: cookie } : BROWSER_HEADERS);
    cookie = mergeCookies(cookie, collectSetCookies(retryRes));
    resultHtml = await retryRes.text();
    resultUrl = retryRes.url;
    if (findPasswordForm(resultHtml)) {
      throw new IncorrectPasswordError();
    }
  }

  return { resolved: { kind: "gallery", html: resultHtml, baseUrl: new URL(resultUrl) }, cookie };
}

/** Parses image URLs out of already-fetched gallery HTML. `includeDirectThumbnails` is false for password-protected galleries, since the scraped URLs may need the same session cookie the browser doesn't have — those fall back to this app's own thumbnail proxy instead. */
export function extractImagesFromHtml(
  html: string,
  baseUrl: URL,
  opts: { includeDirectThumbnails: boolean }
): { folderName: string; images: CloudImage[] } {
  const candidates = [...extractJsonLdImageUrls(html), ...extractImgTagUrls(html), ...extractOgImage(html)];

  const seen = new Set<string>();
  const images: CloudImage[] = [];
  for (const candidate of candidates) {
    const abs = resolveUrl(candidate, baseUrl);
    if (!abs || seen.has(abs) || !isLikelyPhoto(abs)) continue;
    seen.add(abs);
    images.push({
      id: abs,
      name: filenameFromUrl(abs, images.length),
      mimeType: mimeTypeFromUrl(abs),
      sizeBytes: null,
      thumbnailUrl: opts.includeDirectThumbnails ? abs : null,
    });
    if (images.length >= MAX_IMAGES) break;
  }

  if (images.length === 0) {
    throw new Error(
      "Couldn't find any photos on that page. This usually means the gallery loads its images with JavaScript " +
        "(common on Pixieset/SmugMug-style sites) that a direct page fetch can't see — try Google Drive or Dropbox " +
        "instead, or copy a direct link to an individual photo."
    );
  }

  const folderName = extractTitle(html) ?? baseUrl.hostname;
  return { folderName, images };
}

export async function downloadGenericImage(image: CloudImage, cookie?: string | null): Promise<CloudDownload> {
  const headers = cookie ? { ...BROWSER_HEADERS, Cookie: cookie } : BROWSER_HEADERS;
  const res = await fetchWithTimeout(image.id, headers);
  if (!res.ok) throw new Error(`Failed to download "${image.name}" (${res.status}).`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: res.headers.get("content-type") || image.mimeType, filename: image.name };
}
