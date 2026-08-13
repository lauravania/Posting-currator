import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { parseProviderParam, getCloudAdapter, getValidAccessToken } from "@/lib/cloud";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Server-driven folder browser (rather than embedding Google Picker /
// Dropbox Chooser's client-side widgets) — the user selects a folder from
// this list and that selection alone triggers the import, satisfying
// "select a folder/gallery ... automatically import ... without a second
// manual action."
export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const session = await requireSession();
  const provider = parseProviderParam(params.provider);
  if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });

  const limit = rateLimit(`cloud-folders:${session.user.organizationId}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const parentId = req.nextUrl.searchParams.get("parentId");

  const accessToken = await getValidAccessToken(session.user.organizationId, provider);
  if (!accessToken) {
    return NextResponse.json({ error: "Not connected.", connected: false }, { status: 409 });
  }

  try {
    const adapter = getCloudAdapter(provider);
    const folders = await adapter.listFolders(accessToken, parentId);
    return NextResponse.json({ folders });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to list folders." }, { status: 502 });
  }
}
