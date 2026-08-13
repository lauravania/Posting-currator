import type { CloudProviderAdapter, CloudFolder, CloudImage, CloudTokens, CloudDownload } from "./types";

/**
 * Real Dropbox OAuth2 + API v2 integration (plain REST via fetch). Requires
 * a Dropbox app (DROPBOX_APP_KEY / DROPBOX_APP_SECRET) with
 * `files.metadata.read` and `files.content.read` scopes. This is a
 * separate, user-facing OAuth flow from the existing
 * scripts/1_fetch_photos.py, which uses a single pre-generated refresh
 * token for one fixed shared folder rather than per-user login.
 */

const AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const CURRENT_ACCOUNT_URL = "https://api.dropboxapi.com/2/users/get_current_account";
const LIST_FOLDER_URL = "https://api.dropboxapi.com/2/files/list_folder";
const DOWNLOAD_URL = "https://content.dropboxapi.com/2/files/download";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function clientId() {
  return process.env.DROPBOX_APP_KEY;
}
function clientSecret() {
  return process.env.DROPBOX_APP_SECRET;
}

type DropboxEntry = {
  ".tag": "folder" | "file" | "deleted";
  name: string;
  id: string;
  path_lower: string;
  size?: number;
};

export const dropboxAdapter: CloudProviderAdapter = {
  isConfigured() {
    return Boolean(clientId() && clientSecret());
  },

  getAuthUrl(state, redirectUri) {
    const id = clientId();
    if (!id) throw new Error("DROPBOX_APP_KEY is not configured.");
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("token_access_type", "offline"); // request a refresh token
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri): Promise<CloudTokens> {
    const id = clientId();
    const secret = clientSecret();
    if (!id || !secret) throw new Error("Dropbox is not configured.");

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
      throw new Error(`Dropbox token exchange failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    let accountLabel: string | null = null;
    try {
      const who = await fetch(CURRENT_ACCOUNT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${json.access_token}`, "Content-Type": "application/json" },
      });
      if (who.ok) {
        const account = (await who.json()) as { email?: string };
        accountLabel = account.email ?? null;
      }
    } catch {
      // Non-fatal.
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      scope: json.scope ?? null,
      accountLabel,
    };
  },

  async refreshAccessToken(refreshToken): Promise<CloudTokens> {
    const id = clientId();
    const secret = clientSecret();
    if (!id || !secret) throw new Error("Dropbox is not configured.");

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
      throw new Error(`Dropbox token refresh failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    return {
      accessToken: json.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      scope: null,
      accountLabel: null,
    };
  },

  async listFolders(accessToken, parentId): Promise<CloudFolder[]> {
    const path = parentId ?? ""; // "" is Dropbox's root
    const res = await fetch(LIST_FOLDER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path, recursive: false }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Dropbox API error (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { entries: DropboxEntry[] };
    return json.entries
      .filter((e) => e[".tag"] === "folder")
      .map((e) => ({ id: e.path_lower, name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async listImagesInFolder(accessToken, folderId): Promise<CloudImage[]> {
    const res = await fetch(LIST_FOLDER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path: folderId, recursive: false }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Dropbox API error (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { entries: DropboxEntry[] };
    return json.entries
      .filter((e) => e[".tag"] === "file" && IMAGE_EXTENSIONS.some((ext) => e.name.toLowerCase().endsWith(ext)))
      .map((e) => {
        const ext = IMAGE_EXTENSIONS.find((x) => e.name.toLowerCase().endsWith(x)) ?? ".jpg";
        return { id: e.path_lower, name: e.name, mimeType: EXT_TO_MIME[ext], sizeBytes: e.size ?? null };
      });
  },

  async downloadImage(accessToken, image): Promise<CloudDownload> {
    const res = await fetch(DOWNLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({ path: image.id }),
      },
    });
    if (!res.ok) throw new Error(`Failed to download "${image.name}" from Dropbox (${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mimeType: image.mimeType, filename: image.name };
  },
};
