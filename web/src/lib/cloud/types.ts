export type CloudFolder = {
  id: string;
  name: string;
  hasSubfolders?: boolean;
};

export type CloudImage = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  /** Direct provider-hosted thumbnail URL, when the provider gives us one for free (Google Drive does). Null otherwise — the UI falls back to a proxy route that generates one on demand. */
  thumbnailUrl?: string | null;
};

export type CloudTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  accountLabel: string | null;
};

export type CloudDownload = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
};

/**
 * One real implementation per provider (Google Drive, Dropbox). Every
 * method makes a genuine network call to the provider's API — none of
 * this fakes success. Adapters are only invoked when their provider is
 * configured (see isConfigured()); the UI discloses when a provider isn't
 * set up rather than pretending to connect.
 */
export interface CloudProviderAdapter {
  isConfigured(): boolean;
  getAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<CloudTokens>;
  refreshAccessToken(refreshToken: string): Promise<CloudTokens>;
  listFolders(accessToken: string, parentId: string | null): Promise<CloudFolder[]>;
  listImagesInFolder(accessToken: string, folderId: string): Promise<CloudImage[]>;
  downloadImage(accessToken: string, image: CloudImage): Promise<CloudDownload>;
}
