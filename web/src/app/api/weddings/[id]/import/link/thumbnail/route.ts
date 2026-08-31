import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { parseLinkProviderParam, resolveLinkAuth, downloadLinkImage } from "@/lib/cloud";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * On-demand thumbnail proxy for the browse-and-select preview grid.
 * Google Drive already gives us a free, directly-loadable thumbnailUrl
 * (see CloudImage), so the client only calls this route for providers
 * that don't (Dropbox) — it downloads the full file server-side and
 * resizes it, the same way an actual import would, just without saving
 * anything to the wedding.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();

  const limit = rateLimit(`link-thumb:${session.user.organizationId}`, 180, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  try {
    await requireWeddingInOrg(params.id, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const providerSlug = searchParams.get("provider") || "";
  const provider = parseLinkProviderParam(providerSlug);
  const link = searchParams.get("link") || "";
  const imageId = searchParams.get("imageId") || "";
  const name = searchParams.get("name") || "photo.jpg";
  const password = searchParams.get("password") || undefined;

  if (!provider || !link || !imageId) {
    return NextResponse.json({ error: "Missing parameters." }, { status: 400 });
  }

  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "jpg";
  const mimeType = EXT_MIME[ext] ?? "image/jpeg";

  try {
    const auth = await resolveLinkAuth(session.user.organizationId, provider, link, password);
    if (!auth) return NextResponse.json({ error: "Not connected." }, { status: 409 });

    const download = await downloadLinkImage(auth, link, { id: imageId, name, mimeType, sizeBytes: null });
    const thumb = await sharp(download.buffer).rotate().resize({ width: 320, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();

    return new NextResponse(new Uint8Array(thumb), {
      headers: {
        "Content-Type": "image/jpeg",
        // Private + short-lived: these bytes came from the user's own
        // cloud account, not a public CDN, so don't let shared caches hold them.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load thumbnail." }, { status: 502 });
  }
}
