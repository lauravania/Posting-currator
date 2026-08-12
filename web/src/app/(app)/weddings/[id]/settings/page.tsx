import { requireSession } from "@/lib/session";
import { requireWeddingInOrg } from "@/lib/db-scope";
import { SectionHeading } from "@/components/ui/stat";
import { WeddingForm } from "@/components/weddings/wedding-form";
import { updateWeddingAction, deleteWeddingAction } from "@/app/actions/weddings";
import { Button } from "@/components/ui/button";

export default async function WeddingSettingsPage({ params }: { params: { id: string } }) {
  const session = await requireSession();
  const wedding = await requireWeddingInOrg(params.id, session.user.organizationId);
  const boundUpdate = updateWeddingAction.bind(null, wedding.id);
  const boundDelete = deleteWeddingAction.bind(null, wedding.id);

  return (
    <div className="max-w-3xl space-y-14">
      <div>
        <SectionHeading title="Edit wedding" />
        <WeddingForm
          action={boundUpdate}
          submitLabel="Save changes"
          defaults={{
            coupleName: wedding.coupleName,
            weddingDate: wedding.weddingDate ? wedding.weddingDate.toISOString().slice(0, 10) : undefined,
            venue: wedding.venue ?? undefined,
            location: wedding.location ?? undefined,
            planner: wedding.planner ?? undefined,
            stylist: wedding.stylist ?? undefined,
            decorator: wedding.decorator ?? undefined,
            photographer: wedding.photographer ?? undefined,
            videographer: wedding.videographer ?? undefined,
            makeupArtist: wedding.makeupArtist ?? undefined,
            florist: wedding.florist ?? undefined,
            dressDesigner: wedding.dressDesigner ?? undefined,
            otherVendors: wedding.otherVendors ?? undefined,
            description: wedding.description ?? undefined,
            coupleStory: wedding.coupleStory ?? undefined,
            concept: wedding.concept ?? undefined,
            colorPalette: wedding.colorPalette,
            designKeywords: wedding.designKeywords,
            targetAudience: wedding.targetAudience ?? undefined,
          }}
        />
      </div>
      <div className="border-t border-hairline pt-8">
        <p className="eyebrow mb-3">Danger zone</p>
        <form action={boundDelete}>
          <Button variant="danger" type="submit">
            Delete wedding project
          </Button>
        </form>
      </div>
    </div>
  );
}
