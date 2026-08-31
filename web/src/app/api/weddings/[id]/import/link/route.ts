import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import {
  parseLinkProviderParam,
  linkProviderLabel,
  importSourceForLinkProvider,
  isLinkImportAvailable,
  resolveLinkAuth,
  parseGoogleDriveFolderLink,
  looksLikeDropboxLink,
  looksLikeUrl,
  PasswordRequiredError,
  IncorrectPasswordError,
} from "@/lib/cloud";
import { runLinkImportJob } from "@/lib/import-pipeline";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// The "drop a link" path: paste a shared Google Drive folder link, a
// Dropbox shared link, or any other gallery link (Pixieset, Apple Shared
// Albums, etc.) and import starts. Google Drive/Dropbox need
// GOOGLE_DRIVE_API_KEY / DROPBOX_REFRESH_TOKEN (or an existing "Connect"
// OAuth connection) configured; "other" links need no credential at all —
// they're read directly off the public page. Any of the three can be
// password-protected — pass `password` and it's used to unlock the link.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();

  const limit = rateLimit(`link-import:${session.user.organizationId}`, 20, 60_000);
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
  // From the browse-and-select preview: only import the photos the user
  // checked. Omit/empty to fall back to importing everything found.
  const imageIds: string[] | undefined = Array.isArray(body.imageIds)
    ? body.imageIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
    : undefined;

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

  const job = await prisma.photoImportJob.create({
    data: { weddingId: params.id, source: importSourceForLinkProvider(provider), status: "PENDING", sourceLabel: link },
  });

  void runLinkImportJob(job.id, provider, link, imageIds && imageIds.length > 0 ? imageIds : undefined, password);

  return NextResponse.json({ jobId: job.id });
}
