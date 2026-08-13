import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireWeddingInOrg, NotFoundOrForbiddenError } from "@/lib/db-scope";
import { getCloudAdapter, parseProviderParam, buildRedirectUri } from "@/lib/cloud";
import { signOAuthState } from "@/lib/crypto";
import { randomId } from "@/lib/id";

export const runtime = "nodejs";

// Kicks off the OAuth authorization-code flow: redirects the browser to
// Google's/Dropbox's own consent screen. We never see the user's
// Google/Dropbox credentials — only the authorization code the provider
// sends back to /callback.
export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const session = await requireSession();
  const provider = parseProviderParam(params.provider);
  if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });

  const weddingId = req.nextUrl.searchParams.get("weddingId");
  if (!weddingId) return NextResponse.json({ error: "weddingId is required." }, { status: 400 });

  try {
    await requireWeddingInOrg(weddingId, session.user.organizationId);
  } catch (e) {
    if (e instanceof NotFoundOrForbiddenError) return NextResponse.json({ error: "Wedding not found." }, { status: 404 });
    throw e;
  }

  const adapter = getCloudAdapter(provider);
  if (!adapter.isConfigured()) {
    const back = new URL(`/weddings/${weddingId}/photos`, req.nextUrl.origin);
    back.searchParams.set("cloudError", `${provider === "GOOGLE_DRIVE" ? "Google Drive" : "Dropbox"} isn't configured on this deployment yet.`);
    return NextResponse.redirect(back);
  }

  const nonce = randomId(16);
  const state = signOAuthState({ provider, weddingId, organizationId: session.user.organizationId, nonce });
  const redirectUri = buildRedirectUri(provider, req.nextUrl.origin);

  const res = NextResponse.redirect(adapter.getAuthUrl(state, redirectUri));
  // CSRF guard for the callback: the nonce must round-trip through the
  // provider unchanged (it's embedded in the signed `state`), and this
  // cookie proves the callback is completing a flow *this browser* started.
  res.cookies.set(`oauth_nonce_${provider}`, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
