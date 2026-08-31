import type { CloudProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { googleDriveAdapter, isGoogleDriveApiKeyConfigured } from "./google-drive";
import { dropboxAdapter, isDropboxLinkImportConfigured, getAppAccessToken as getDropboxAppAccessToken } from "./dropbox";
import type { CloudProviderAdapter, CloudTokens } from "./types";

export * from "./types";
export {
  parseGoogleDriveFolderLink,
  getPublicFolderName as getGoogleDrivePublicFolderName,
  listImagesInPublicFolder as listGoogleDrivePublicFolderImages,
  downloadPublicImage as downloadGoogleDrivePublicImage,
} from "./google-drive";
export {
  looksLikeDropboxLink,
  getSharedLinkName as getDropboxSharedLinkName,
  listImagesInSharedLink as listDropboxSharedLinkImages,
  downloadSharedLinkFile as downloadDropboxSharedLinkFile,
} from "./dropbox";

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
// ---------------------------------------------------------------------------

export function isLinkImportAvailable(provider: CloudProvider): boolean {
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
