import { requireSession } from "@/lib/session";
import { requireWeddingInOrg } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { Stat } from "@/components/ui/stat";

export default async function WeddingOverviewPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const wedding = await requireWeddingInOrg(params.id, session.user.organizationId);

  const [photoCount, keepCount, postCount, vendorCount] = await Promise.all([
    prisma.photo.count({ where: { weddingId: wedding.id } }),
    prisma.photoAnalysis.count({ where: { verdict: "KEEP", photo: { weddingId: wedding.id } } }),
    prisma.contentPost.count({ where: { weddingId: wedding.id } }),
    prisma.vendor.count({ where: { weddingId: wedding.id } }),
  ]);

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Photos" value={photoCount} />
        <Stat label="Keepers" value={keepCount} />
        <Stat label="Content posts" value={postCount} />
        <Stat label="Vendors tagged" value={vendorCount} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div>
          <p className="eyebrow mb-3">Couple story</p>
          <p className="font-sans text-sm text-ink-soft leading-relaxed">{wedding.coupleStory || "Not documented yet."}</p>
        </div>
        <div>
          <p className="eyebrow mb-3">Concept</p>
          <p className="font-sans text-sm text-ink-soft leading-relaxed">{wedding.concept || "Not documented yet."}</p>
        </div>
        <div>
          <p className="eyebrow mb-3">Color palette</p>
          <div className="flex flex-wrap gap-2">
            {wedding.colorPalette.length === 0 && <p className="font-sans text-sm text-ink-soft">None specified.</p>}
            {wedding.colorPalette.map((c) => (
              <span key={c} className="font-sans text-xs border border-hairline px-3 py-1">
                {c}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow mb-3">Design keywords</p>
          <div className="flex flex-wrap gap-2">
            {wedding.designKeywords.length === 0 && <p className="font-sans text-sm text-ink-soft">None specified.</p>}
            {wedding.designKeywords.map((c) => (
              <span key={c} className="font-sans text-xs border border-hairline px-3 py-1">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="eyebrow mb-3">Vendor team</p>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 font-sans text-sm">
          {[
            ["Planner", wedding.planner],
            ["Stylist", wedding.stylist],
            ["Decorator", wedding.decorator],
            ["Photographer", wedding.photographer],
            ["Videographer", wedding.videographer],
            ["Makeup artist", wedding.makeupArtist],
            ["Florist", wedding.florist],
            ["Dress designer", wedding.dressDesigner],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-soft text-xs mb-1">{label}</dt>
              <dd>{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
