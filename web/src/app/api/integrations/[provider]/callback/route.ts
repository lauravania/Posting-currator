import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { parseProviderParam, buildRedirectUri, completeOAuthConnection, providerLabel } from "@/lib/cloud";
import { verifyOAuthState } from "@/lib/crypto";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const session = await requireSession();
  const provider = parseProviderParam(params.provider);
  if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });

  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const providerError = req.nextUrl.searchParams.get("error");

  const state = stateRaw
    ? verifyOAuthState<{ provider: string; weddingId: string; organizationId: string; nonce: string }>(stateRaw)
    : null;

  // We don't know the wedding to redirect back to if the state can't be
  // verified at all — fall back to the general Weddings list rather than
  // guessing.
  const fallback = new URL("/weddings", req.nextUrl.origin);

  if (providerError) {
    const back = state ? new URL(`/weddings/${state.weddingId}/photos`, req.nextUrl.origin) : fallback;
    back.searchParams.set("cloudError", `${providerLabel(provider)} authorization was cancelled or denied.`);
    return NextResponse.redirect(back);
  }

  if (!code || !state) {
    const back = state ? new URL(`/weddings/${state.weddingId}/photos`, req.nextUrl.origin) : fallback;
    back.searchParams.set("cloudError", "The authorization response was invalid or expired — please try connecting again.");
    return NextResponse.redirect(back);
  }

  const back = new URL(`/weddings/${state.weddingId}/photos`, req.nextUrl.origin);

  // CSRF check: state.nonce must match the cookie set right before we sent
  // the user to the provider, and state.organizationId must match the
  // signed-in session's org — otherwise this callback could be replayed
  // against a different account.
  const cookieNonce = req.cookies.get(`oauth_nonce_${provider}`)?.value;
  if (!cookieNonce || cookieNonce !== state.nonce || state.organizationId !== session.user.organizationId) {
    back.searchParams.set("cloudError", "Could not verify the authorization request — please try connecting again.");
    return NextResponse.redirect(back);
  }

  try {
    const redirectUri = buildRedirectUri(provider, req.nextUrl.origin);
    await completeOAuthConnection(session.user.organizationId, provider, code, redirectUri);
    back.searchParams.set("cloudConnected", providerLabel(provider));
  } catch (err) {
    back.searchParams.set("cloudError", err instanceof Error ? err.message : `Failed to connect ${providerLabel(provider)}.`);
  }

  const res = NextResponse.redirect(back);
  res.cookies.delete(`oauth_nonce_${provider}`);
  return res;
}
