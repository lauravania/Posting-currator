import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SectionHeading } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";

export default async function WeddingsPage() {
  const session = await requireSession();
  const weddings = await prisma.wedding.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { photos: true, contentPosts: true } } },
  });

  return (
    <div>
      <SectionHeading
        eyebrow="Workspace"
        title="Weddings"
        action={
          <Link href="/weddings/new">
            <Button>New wedding</Button>
          </Link>
        }
      />
      {weddings.length === 0 ? (
        <p className="font-sans text-ink-soft">No weddings yet. Create your first one to start uploading photos.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {weddings.map((w) => (
            <Link key={w.id} href={`/weddings/${w.id}`} className="block border border-hairline p-6 hover:border-gold transition-colors">
              <p className="eyebrow mb-2">{w.location ?? "Location TBD"}</p>
              <p className="font-serif text-xl mb-1">{w.coupleName}</p>
              <p className="font-sans text-xs text-ink-soft">
                {w.weddingDate ? new Date(w.weddingDate).toLocaleDateString() : "Date TBD"} · {w._count.photos} photos ·{" "}
                {w._count.contentPosts} posts
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
