import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import {
  parseProviderParam,
  isLinkImportAvailable,
  resolveLinkAuth,
  listImagesForLink,
  parseGoogleDriveFolderLink,
  looksLikeDropboxLink,
} from "@/lib/cloud";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Opens a pasted link and lists what's inside it — without importing or
 * downloading anything — so the browse-and-select UI can show a thumbnail
 * grid the user picks from before anything is added to the wedding.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();

  const limit = rateLimit(`link-preview:${session.user.organizationId}`, 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  try {
    await requireWeddingInOrg(params.id, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const providerSlug = String(body.provider || "");
  const provider = providerSlug === "google-drive" ? "GOOGLE_DRIVE" : providerSlug === "dropbox" ? "DROPBOX" : parseProviderParam(providerSlug);
  const link = String(body.link || "").trim();

  if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  if (!link) return NextResponse.json({ error: "Paste a link first." }, { status: 400 });

  if (provider === "GOOGLE_DRIVE") {
    if (!parseGoogleDriveFolderLink(link)) {
      return NextResponse.json({ error: "That doesn't look like a Google Drive folder link." }, { status: 400 });
    }
  } else if (!looksLikeDropboxLink(link)) {
    return NextResponse.json({ error: "That doesn't look like a Dropbox share link." }, { status: 400 });
  }

  const organizationId = session.user.organizationId;
  const auth = await resolveLinkAuth(organizationId, provider, link);
  if (!auth) {
    const providerName = provider === "GOOGLE_DRIVE" ? "Google Drive" : "Dropbox";
    const envHint = provider === "GOOGLE_DRIVE" ? "GOOGLE_DRIVE_API_KEY" : "DROPBOX_REFRESH_TOKEN";
    return NextResponse.json(
      {
        error: isLinkImportAvailable(provider)
          ? `Could not access that ${providerName} link.`
          : `${providerName} link import isn't configured yet (missing ${envHint}) — connect an account instead, or ask an admin to set it up.`,
      },
      { status: 409 }
    );
  }

  try {
    const { folderName, images } = await listImagesForLink(auth, link);
    return NextResponse.json({ folderName, images });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not open that link." }, { status: 502 });
  }
}
