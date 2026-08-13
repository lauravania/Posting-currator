import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { parseProviderParam, disconnectCloudProvider } from "@/lib/cloud";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { provider: string } }) {
  const session = await requireSession();
  const provider = parseProviderParam(params.provider);
  if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });

  await disconnectCloudProvider(session.user.organizationId, provider);
  return NextResponse.json({ ok: true });
}
