import { requireSession } from "@/lib/session";
import { requireWeddingInOrg } from "@/lib/db-scope";
import { prisma } from "@/lib/prisma";
import { SectionHeading } from "@/components/ui/stat";
import { VendorForm } from "@/components/weddings/vendor-form";
import { createVendorAction, deleteVendorAction } from "@/app/actions/vendors";

export default async function WeddingVendorsPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const wedding = await requireWeddingInOrg(params.id, session.user.organizationId);
  const vendors = await prisma.vendor.findMany({ where: { weddingId: wedding.id }, orderBy: { createdAt: "asc" } });
  const boundCreate = createVendorAction.bind(null, wedding.id);

  return (
    <div className="space-y-10">
      <SectionHeading eyebrow="Vendor database" title="Vendors on this wedding" />
      <VendorForm action={boundCreate} />

      {vendors.length === 0 ? (
        <p className="font-sans text-sm text-ink-soft">No vendors added yet.</p>
      ) : (
        <div className="divide-y divide-hairline border-t border-b border-hairline font-sans text-sm">
          {vendors.map((v) => (
            <div key={v.id} className="flex items-center justify-between py-4">
              <div>
                <p className="font-serif text-lg">{v.name}</p>
                <p className="text-ink-soft text-xs mt-1">
                  {v.category} {v.instagramHandle ? `· ${v.instagramHandle}` : ""} {v.location ? `· ${v.location}` : ""}
                </p>
              </div>
              <form action={deleteVendorAction.bind(null, wedding.id, v.id)}>
                <button className="text-xs text-ink-soft hover:text-reject">Remove</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
