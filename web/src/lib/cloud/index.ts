import type { CloudProvider, ImportSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  googleDriveAdapter,
  isGoogleDriveApiKeyConfigured,
  parseGoogleDriveFolderLink,
  getPublicFolderName as getGoogleDrivePublicFolderName,
  getFolderNameOAuth as getGoogleDriveFolderNameOAuth,
  listImagesInPublicFolder as listGoogleDrivePublicFolderImages,
  downloadPublicImage as downloadGoogleDrivePublicImage,
} from "./google-drive";
import {
  dropboxAdapter,
  isDropboxLinkImportConfigured,
  getAppAccessToken as getDropboxAppAccessToken,
  getSharedLinkName as getDropboxSharedLinkName,
  listImagesInSharedLink as listDropboxSharedLinkImages,
  downloadSharedLinkFile as downloadDropboxSharedLinkFile,
} from "./dropbox";
import { looksLikeUrl, resolveGenericLink, extractImagesFromHtml, downloadGenericImage } from "./generic-link";
import type { CloudProviderAdapter, CloudTokens, CloudImage } from "./types";

export * from "./types";
export { parseGoogleDriveFolderLink, downloadPublicImage as downloadGoogleDrivePublicImage } from "./google-drive";
export { looksLikeDropboxLink, downloadSharedLinkFile as downloadDropboxSharedLinkFile } from "./dropbox";
export { looksLikeUrl, PasswordRequiredError, IncorrectPasswordError } from "./generic-link";

const ADAPTERS: Record<CloudProvider, CloudProviderAdapter> = {
  GOOGLE_DRIVE: googleDriveAdapter,
  DROPBOX: dropboxAdapter,
};

export function getCloudAdapter(provider: CloudProvider): CloudProviderAdapter {
  return ADAPTERS[provider];
}

export function isCloudProviderConfigured(provider: CloudProvider): boolean {
  return ADAPTERS[provider].isConfigured();
}

export function providerLabel(provider: CloudProvider): string {
  return provider === "GOOGLE_DRIVE" ? "Google Drive" : "Dropbox";
}

/** Maps the `[provider]` URL segment ("google-drive" | "dropbox") to the enum. */
export function parseProviderParam(param: string): CloudProvider | null {
  if (param === "google-drive") return "GOOGLE_DRIVE";
  if (param === "dropbox") return "DROPBOX";
  return null;
}

export function providerUrlSegment(provider: CloudProvider): string {
  return provider === "GOOGLE_DRIVE" ? "google-drive" : "dropbox";
}

/** Redirect URI Google/Dropbox send the user back to after consent. */
export function buildRedirectUri(provider: CloudProvider, origin: string): string {
  const path = provider === "GOOGLE_DRIVE" ? "google-drive" : "dropbox";
  return `${origin}/api/integrations/${path}/callback`;
}

async function saveConnection(organizationId: string, provider: CloudProvider, tokens: CloudTokens) {
  await prisma.cloudConnection.upsert({
    where: { organizationId_provider: { organizationId, provider } },
    create: {
      organizationId,
      provider,
      accountLabel: tokens.accountLabel,
      accessTokenEnc: encryptSecret(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    },
    update: {
      accountLabel: tokens.accountLabel ?? undefined,
      accessTokenEnc: encryptSecret(tokens.accessToken),
      // Google in particular only re-issues a refresh token on the very
      // first consent — keep the existing one if this exchange didn't get
      // a new one.
      ...(tokens.refreshToken ? { refreshTokenEnc: encryptSecret(tokens.refreshToken) } : {}),
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    },
  });
}

export async function completeOAuthConnection(
  organizationId: string,
  provider: CloudProvider,
  code: string,
  redirectUri: string
) {
  const adapter = getCloudAdapter(provider);
  const tokens = await adapter.exchangeCode(code, redirectUri);
  await saveConnection(organizationId, provider, tokens);
}

export async function disconnectCloudProvider(organizationId: string, provider: CloudProvider) {
  await prisma.cloudConnection.deleteMany({ where: { organizationId, provider } });
}

/**
 * Returns a live access token for this org's connection, refreshing (and
 * persisting the refresh) if it's expired or about to expire. Returns
 * null if there's no connection at all — callers should treat that as
 * "not connected", not as an error.
 */
export async function getValidAccessToken(organizationId: string, provider: CloudProvider): Promise<string | null> {
  const connection = await prisma.cloudConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  if (!connection) return null;

  const expiringWithinMs = 60_000;
  const isExpired = connection.expiresAt ? connection.expiresAt.getTime() - Date.now() < expiringWithinMs : false;

  if (!isExpired) {
    return decryptSecret(connection.accessTokenEnc);
  }

  if (!connection.refreshTokenEnc) {
    // Access token expired and we have no way to refresh — the connection
    // is effectively dead; the caller should prompt reconnection.
    return null;
  }

  const adapter = getCloudAdapter(provider);
  const refreshToken = decryptSecret(connection.refreshTokenEnc);
  const tokens = await adapter.refreshAccessToken(refreshToken);
  await saveConnection(organizationId, provider, tokens);
  return tokens.accessToken;
}

// ---------------------------------------------------------------------------
// "Drop a link" support — whether a provider's simple, no-OAuth-consent
// credential is set (GOOGLE_DRIVE_API_KEY / DROPBOX_REFRESH_TOKEN), which
// is enough to import from a link even for an org that never went through
// the "Connect" flow. An existing OAuth connection still works too and is
// preferred where present (see resolve*Auth below).
//
// "OTHER" is a third, wider category: any link this app has no dedicated
// API integration for (Pixieset, Apple Shared Albums, SmugMug, a
// photographer's own site, ...). There's no credential to configure for
// it — it just reads the public page directly — so it's always available.
// ---------------------------------------------------------------------------

export type LinkProvider = CloudProvider | "OTHER";

/** Maps the `[provider]` URL segment ("google-drive" | "dropbox" | "other") used by the link-import routes. Distinct from parseProviderParam, which is OAuth-only and has no "other" case. */
export function parseLinkProviderParam(param: string): LinkProvider | null {
  if (param === "google-drive") return "GOOGLE_DRIVE";
  if (param === "dropbox") return "DROPBOX";
  if (param === "other") return "OTHER";
  return null;
}

export function linkProviderLabel(provider: LinkProvider): string {
  return provider === "OTHER" ? "Other link" : providerLabel(provider);
}

/** The ImportSource value photos get tagged with once imported via this provider — distinct from LinkProvider/CloudProvider because "OTHER" isn't a value those enums have. */
export function importSourceForLinkProvider(provider: LinkProvider): ImportSource {
  return provider === "OTHER" ? "OTHER_LINK" : provider;
}

export function isLinkImportAvailable(provider: LinkProvider): boolean {
  if (provider === "OTHER") return true;
  return provider === "GOOGLE_DRIVE" ? isGoogleDriveApiKeyConfigured() : isDropboxLinkImportConfigured();
}

export type GoogleDriveAuth = { mode: "oauth"; accessToken: string } | { mode: "apikey"; apiKey: string };

/** Prefers an existing OAuth connection (works on private folders too); falls back to the plain API key (public/"anyone with the link" folders only). */
export async function resolveGoogleDriveAuth(organizationId: string): Promise<GoogleDriveAuth | null> {
  const oauthToken = await getValidAccessToken(organizationId, "GOOGLE_DRIVE");
  if (oauthToken) return { mode: "oauth", accessToken: oauthToken };
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (apiKey) return { mode: "apikey", apiKey };
  return null;
}

/** Dropbox's shared-link APIs take a plain bearer token regardless of source, so OAuth and app-level tokens are interchangeable here. */
export async function resolveDropboxToken(organizationId: string): Promise<string | null> {
  const oauthToken = await getValidAccessToken(organizationId, "DROPBOX");
  if (oauthToken) return oauthToken;
  if (isDropboxLinkImportConfigured()) return getDropboxAppAccessToken();
  return null;
}

export type LinkAuth =
  | { provider: "GOOGLE_DRIVE"; mode: "oauth"; accessToken: string; folderId: string }
  | { provider: "GOOGLE_DRIVE"; mode: "apikey"; apiKey: string; folderId: string }
  | { provider: "DROPBOX"; accessToken: string; password?: string }
  | { provider: "OTHER"; cookie: string | null; resolved: import("./generic-link").GenericResolved };

/**
 * Resolves whatever's needed to read a pasted link (OAuth connection
 * first, then the simple key/token) — the one place both the preview and
 * import routes figure out "can we actually reach this link, and how".
 *
 * `password` only applies to Dropbox (passed straight through to its
 * shared-link API) and OTHER (submitted to a detected password form —
 * see resolveGenericLink). For OTHER this can throw PasswordRequiredError
 * or IncorrectPasswordError, which callers should handle distinctly from
 * a generic failure to open the link.
 */
export async function resolveLinkAuth(
  organizationId: string,
  provider: LinkProvider,
  link: string,
  password?: string
): Promise<LinkAuth | null> {
  if (provider === "GOOGLE_DRIVE") {
    const folderId = parseGoogleDriveFolderLink(link);
    if (!folderId) return null;
    const auth = await resolveGoogleDriveAuth(organizationId);
    if (!auth) return null;
    return auth.mode === "oauth"
      ? { provider, mode: "oauth", accessToken: auth.accessToken, folderId }
      : { provider, mode: "apikey", apiKey: auth.apiKey, folderId };
  }
  if (provider === "DROPBOX") {
    const accessToken = await resolveDropboxToken(organizationId);
    if (!accessToken) return null;
    return { provider, accessToken, password };
  }
  // OTHER: no credential to check, but the page itself might be gated.
  if (!looksLikeUrl(link)) return null;
  const { resolved, cookie } = await resolveGenericLink(link, password);
  return { provider: "OTHER", cookie, resolved };
}

/** Lists a link's folder name + images without downloading/importing anything — used by the preview (browse-and-select) endpoint, and internally by the import job once files are actually chosen. */
export async function listImagesForLink(auth: LinkAuth, link: string): Promise<{ folderName: string; images: CloudImage[] }> {
  if (auth.provider === "GOOGLE_DRIVE") {
    if (auth.mode === "oauth") {
      const [folderName, images] = await Promise.all([
        getGoogleDriveFolderNameOAuth(auth.accessToken, auth.folderId),
        getCloudAdapter("GOOGLE_DRIVE").listImagesInFolder(auth.accessToken, auth.folderId),
      ]);
      return { folderName, images };
    }
    const [folderName, images] = await Promise.all([
      getGoogleDrivePublicFolderName(auth.apiKey, auth.folderId),
      listGoogleDrivePublicFolderImages(auth.apiKey, auth.folderId),
    ]);
    return { folderName, images };
  }
  if (auth.provider === "DROPBOX") {
    const [folderName, images] = await Promise.all([
      getDropboxSharedLinkName(auth.accessToken, link, auth.password),
      listDropboxSharedLinkImages(auth.accessToken, link, auth.password),
    ]);
    return { folderName, images };
  }
  if (auth.resolved.kind === "single") {
    return { folderName: auth.resolved.image.name, images: [auth.resolved.image] };
  }
  // A password-protected gallery's scraped image URLs may need the same
  // session cookie a browser tab doesn't have — route those through this
  // app's own thumbnail proxy instead of hotlinking them directly.
  return extractImagesFromHtml(auth.resolved.html, auth.resolved.baseUrl, { includeDirectThumbnails: !auth.cookie });
}

/** Downloads one previously-listed image, using whichever auth mode resolveLinkAuth settled on. */
export async function downloadLinkImage(auth: LinkAuth, link: string, image: CloudImage) {
  if (auth.provider === "GOOGLE_DRIVE") {
    return auth.mode === "oauth"
      ? getCloudAdapter("GOOGLE_DRIVE").downloadImage(auth.accessToken, image)
      : downloadGoogleDrivePublicImage(auth.apiKey, image);
  }
  if (auth.provider === "DROPBOX") {
    return downloadDropboxSharedLinkFile(auth.accessToken, link, image, auth.password);
  }
  return downloadGenericImage(image, auth.cookie);
}
