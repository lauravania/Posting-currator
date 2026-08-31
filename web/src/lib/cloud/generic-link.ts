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
 */

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

export async function listImagesFromGenericLink(link: string): Promise<{ folderName: string; images: CloudImage[] }> {
  if (!looksLikeUrl(link)) throw new Error("That doesn't look like a valid link.");

  const res = await fetchWithTimeout(link, BROWSER_HEADERS);
  if (!res.ok) {
    throw new Error(`Couldn't open that page (${res.status}). Check the link is public and try again.`);
  }

  const contentType = res.headers.get("content-type") ?? "";

  // The pasted link is itself a single hosted photo, not a gallery page.
  if (contentType.startsWith("image/")) {
    const base = new URL(res.url);
    return {
      folderName: filenameFromUrl(base.toString(), 0),
      images: [{ id: base.toString(), name: filenameFromUrl(base.toString(), 0), mimeType: contentType, sizeBytes: null }],
    };
  }

  if (!contentType.includes("text/html")) {
    throw new Error("That link doesn't point to a web page or photo this app can read.");
  }

  const html = await res.text();
  const base = new URL(res.url);

  const candidates = [...extractJsonLdImageUrls(html), ...extractImgTagUrls(html), ...extractOgImage(html)];

  const seen = new Set<string>();
  const images: CloudImage[] = [];
  for (const candidate of candidates) {
    const abs = resolveUrl(candidate, base);
    if (!abs || seen.has(abs) || !isLikelyPhoto(abs)) continue;
    seen.add(abs);
    images.push({
      id: abs,
      name: filenameFromUrl(abs, images.length),
      mimeType: mimeTypeFromUrl(abs),
      sizeBytes: null,
      // The scraped URL is already a public, directly-loadable image —
      // no need to proxy/resize it just to show a preview thumbnail.
      thumbnailUrl: abs,
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

  const folderName = extractTitle(html) ?? base.hostname;
  return { folderName, images };
}

export async function downloadGenericImage(image: CloudImage): Promise<CloudDownload> {
  const res = await fetchWithTimeout(image.id, BROWSER_HEADERS);
  if (!res.ok) throw new Error(`Failed to download "${image.name}" (${res.status}).`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: res.headers.get("content-type") || image.mimeType, filename: image.name };
}
