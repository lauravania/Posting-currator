import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isCloudProviderConfigured, isLinkImportAvailable } from "@/lib/cloud";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();

  const connections = await prisma.cloudConnection.findMany({
    where: { organizationId: session.user.organizationId },
  });
  const byProvider = Object.fromEntries(connections.map((c) => [c.provider, c]));

  return NextResponse.json({
    googleDrive: {
      configured: isCloudProviderConfigured("GOOGLE_DRIVE"),
      connected: Boolean(byProvider.GOOGLE_DRIVE),
      accountLabel: byProvider.GOOGLE_DRIVE?.accountLabel ?? null,
      linkImportAvailable: isLinkImportAvailable("GOOGLE_DRIVE"),
    },
    dropbox: {
      configured: isCloudProviderConfigured("DROPBOX"),
      connected: Boolean(byProvider.DROPBOX),
      accountLabel: byProvider.DROPBOX?.accountLabel ?? null,
      linkImportAvailable: isLinkImportAvailable("DROPBOX"),
    },
  });
}
