import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import {
  parseLinkProviderParam,
  linkProviderLabel,
  isLinkImportAvailable,
  resolveLinkAuth,
  listImagesForLink,
  parseGoogleDriveFolderLink,
  looksLikeDropboxLink,
  looksLikeUrl,
  PasswordRequiredError,
  IncorrectPasswordError,
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
  const provider = parseLinkProviderParam(String(body.provider || ""));
  const link = String(body.link || "").trim();
  const password = typeof body.password === "string" && body.password.length > 0 ? body.password : undefined;

  if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  if (!link) return NextResponse.json({ error: "Paste a link first." }, { status: 400 });

  if (provider === "GOOGLE_DRIVE" && !parseGoogleDriveFolderLink(link)) {
    return NextResponse.json({ error: "That doesn't look like a Google Drive folder link." }, { status: 400 });
  }
  if (provider === "DROPBOX" && !looksLikeDropboxLink(link)) {
    return NextResponse.json({ error: "That doesn't look like a Dropbox share link." }, { status: 400 });
  }
  if (provider === "OTHER" && !looksLikeUrl(link)) {
    return NextResponse.json({ error: "That doesn't look like a valid link." }, { status: 400 });
  }

  const organizationId = session.user.organizationId;
  let auth;
  try {
    auth = await resolveLinkAuth(organizationId, provider, link, password);
  } catch (err) {
    if (err instanceof PasswordRequiredError) {
      return NextResponse.json({ error: "This link is password protected — enter the password and try again.", passwordRequired: true }, { status: 401 });
    }
    if (err instanceof IncorrectPasswordError) {
      return NextResponse.json({ error: "That password wasn't accepted — check it and try again.", passwordRequired: true }, { status: 401 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not access that link." }, { status: 502 });
  }

  if (!auth) {
    const providerName = linkProviderLabel(provider);
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
