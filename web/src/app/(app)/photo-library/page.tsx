import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { SectionHeading } from "@/components/ui/stat";

export default async function PhotoLibraryPage() {
  const session = await requireSession();
  const storage = getStorageAdapter();

  const weddings = await prisma.wedding.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      photos: {
        orderBy: { uploadedAt: "desc" },
        take: 6,
        include: { analysis: true },
      },
      _count: { select: { photos: true } },
    },
  });

  return (
    <div className="space-y-14">
      <SectionHeading eyebrow="Library" title="Photo Library" />
      {weddings.length === 0 && <p className="font-sans text-sm text-ink-soft">Create a wedding to start uploading photos.</p>}
      {weddings
        .filter((w) => w._count.photos > 0)
        .map((w) => (
          <section key={w.id}>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="eyebrow mb-1">{w.location ?? "Location TBD"}</p>
                <p className="font-serif text-xl">{w.coupleName}</p>
              </div>
              <Link href={`/weddings/${w.id}/photos`} className="eyebrow text-ink-soft hover:text-ink">
                View all {w._count.photos} →
              </Link>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {w.photos.map((p) => (
                <Link
                  key={p.id}
                  href={`/weddings/${w.id}/photos`}
                  className="relative aspect-[4/5] block overflow-hidden bg-paper border border-hairline"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={storage.publicUrl(p.thumbnailKey ?? p.storageKey)} alt={p.originalFilename} className="w-full h-full object-cover" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      {weddings.length > 0 && weddings.every((w) => w._count.photos === 0) && (
        <p className="font-sans text-sm text-ink-soft">No photos uploaded yet across your weddings.</p>
      )}
    </div>
  );
}
