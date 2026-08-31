import type { CloudProviderAdapter, CloudFolder, CloudImage, CloudTokens, CloudDownload } from "./types";

/**
 * Real Google Drive OAuth2 + Drive API v3 integration (plain REST via
 * fetch — no SDK dependency). Requires a Google Cloud OAuth client
 * (GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET) with the Drive API
 * enabled. See .env.example for setup notes.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/userinfo.email"];

function clientId() {
  return process.env.GOOGLE_DRIVE_CLIENT_ID;
}
function clientSecret() {
  return process.env.GOOGLE_DRIVE_CLIENT_SECRET;
}

async function driveFetch(path: string, accessToken: string, params?: Record<string, string>) {
  const url = new URL(path);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Drive API error (${res.status}): ${body.slice(0, 300)}`);
  }
  return res;
}

export async function getFolderNameOAuth(accessToken: string, folderId: string): Promise<string> {
  const res = await driveFetch(`${DRIVE_FILES_URL}/${folderId}`, accessToken, { fields: "name,mimeType" });
  const json = (await res.json()) as { name: string; mimeType: string };
  if (json.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("That link doesn't point to a Google Drive folder.");
  }
  return json.name;
}

export const googleDriveAdapter: CloudProviderAdapter = {
  isConfigured() {
    return Boolean(clientId() && clientSecret());
  },

  getAuthUrl(state, redirectUri) {
    const id = clientId();
    if (!id) throw new Error("GOOGLE_DRIVE_CLIENT_ID is not configured.");
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("access_type", "offline"); // request a refresh token
    url.searchParams.set("prompt", "consent"); // ensure a refresh token is issued every time
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri): Promise<CloudTokens> {
    const id = clientId();
    const secret = clientSecret();
    if (!id || !secret) throw new Error("Google Drive is not configured.");

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google token exchange failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    let accountLabel: string | null = null;
    try {
      const who = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${json.access_token}` } });
      if (who.ok) accountLabel = ((await who.json()) as { email?: string }).email ?? null;
    } catch {
      // Non-fatal — connection still works without a display label.
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      scope: json.scope,
      accountLabel,
    };
  },

  async refreshAccessToken(refreshToken): Promise<CloudTokens> {
    const id = clientId();
    const secret = clientSecret();
    if (!id || !secret) throw new Error("Google Drive is not configured.");

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: id,
        client_secret: secret,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google token refresh failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number; scope: string };
    return {
      accessToken: json.access_token,
      refreshToken, // Google only re-issues a refresh token on first consent
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      scope: json.scope,
      accountLabel: null,
    };
  },

  async listFolders(accessToken, parentId): Promise<CloudFolder[]> {
    const parent = parentId ?? "root";
    const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and '${parent}' in parents`;
    const res = await driveFetch(DRIVE_FILES_URL, accessToken, {
      q,
      fields: "files(id,name)",
      pageSize: "200",
      orderBy: "name",
    });
    const json = (await res.json()) as { files: { id: string; name: string }[] };
    return json.files.map((f) => ({ id: f.id, name: f.name }));
  },

  async listImagesInFolder(accessToken, folderId): Promise<CloudImage[]> {
    const q = `mimeType contains 'image/' and trashed=false and '${folderId}' in parents`;
    const res = await driveFetch(DRIVE_FILES_URL, accessToken, {
      q,
      fields: "files(id,name,mimeType,size,thumbnailLink)",
      pageSize: "1000",
    });
    const json = (await res.json()) as { files: { id: string; name: string; mimeType: string; size?: string; thumbnailLink?: string }[] };
    return json.files.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.size ? Number(f.size) : null,
      thumbnailUrl: f.thumbnailLink ?? null,
    }));
  },

  async downloadImage(accessToken, image): Promise<CloudDownload> {
    const res = await fetch(`${DRIVE_FILES_URL}/${image.id}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Failed to download "${image.name}" from Google Drive (${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mimeType: image.mimeType, filename: image.name };
  },
};

// ---------------------------------------------------------------------------
// "Drop a link" import — no OAuth consent screen required. Works for a
// folder shared as "Anyone with the link", authenticated with a plain
// Google API key (GOOGLE_DRIVE_API_KEY) rather than a per-user OAuth token.
// If the org already has a Google Drive OAuth connection, callers should
// prefer that instead (see resolveGoogleDriveAuth in lib/cloud/index.ts) —
// it also works for a link the connected account can view, OAuth'd or not.
// ---------------------------------------------------------------------------

export function isGoogleDriveApiKeyConfigured(): boolean {
  return Boolean(process.env.GOOGLE_DRIVE_API_KEY);
}

/**
 * Accepts any of Google Drive's folder link shapes and returns the bare
 * folder ID, or null if the string doesn't look like a Drive folder link
 * at all.
 *   https://drive.google.com/drive/folders/<id>?usp=sharing
 *   https://drive.google.com/drive/u/0/folders/<id>
 *   https://drive.google.com/open?id=<id>
 *   a bare folder ID pasted directly
 */
export function parseGoogleDriveFolderLink(input: string): string | null {
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed; // looks like a bare ID
  return null;
}

async function driveFetchWithKey(path: string, apiKey: string, params?: Record<string, string>) {
  const url = new URL(path);
  url.searchParams.set("key", apiKey);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 400 && /API key not valid/i.test(body)) {
      throw new Error("GOOGLE_DRIVE_API_KEY is set but isn't a valid Google API key — check it in the Render/host environment settings.");
    }
    const hint =
      res.status === 403 || res.status === 404
        ? " (make sure the folder is shared as \"Anyone with the link\")"
        : "";
    throw new Error(`Google Drive API error (${res.status})${hint}: ${body.slice(0, 300)}`);
  }
  return res;
}

export async function getPublicFolderName(apiKey: string, folderId: string): Promise<string> {
  const res = await driveFetchWithKey(`${DRIVE_FILES_URL}/${folderId}`, apiKey, { fields: "name,mimeType" });
  const json = (await res.json()) as { name: string; mimeType: string };
  if (json.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("That link doesn't point to a Google Drive folder.");
  }
  return json.name;
}

export async function listImagesInPublicFolder(apiKey: string, folderId: string): Promise<CloudImage[]> {
  const q = `mimeType contains 'image/' and trashed=false and '${folderId}' in parents`;
  const res = await driveFetchWithKey(DRIVE_FILES_URL, apiKey, {
    q,
    fields: "files(id,name,mimeType,size,thumbnailLink)",
    pageSize: "1000",
  });
  const json = (await res.json()) as { files: { id: string; name: string; mimeType: string; size?: string; thumbnailLink?: string }[] };
  return json.files.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    sizeBytes: f.size ? Number(f.size) : null,
    thumbnailUrl: f.thumbnailLink ?? null,
  }));
}

export async function downloadPublicImage(apiKey: string, image: CloudImage): Promise<CloudDownload> {
  const res = await driveFetchWithKey(`${DRIVE_FILES_URL}/${image.id}`, apiKey, { alt: "media" });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: image.mimeType, filename: image.name };
}
