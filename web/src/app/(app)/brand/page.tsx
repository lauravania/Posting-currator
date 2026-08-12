import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SectionHeading } from "@/components/ui/stat";
import { BrandForm } from "@/components/brand/brand-form";

export default async function BrandSettingsPage() {
  const session = await requireSession();
  const brand = await prisma.brand.findUnique({ where: { organizationId: session.user.organizationId } });

  return (
    <div className="max-w-3xl">
      <SectionHeading eyebrow="Brand Settings" title="Your creative direction" />
      <p className="font-sans text-sm text-ink-soft -mt-4 mb-10 max-w-xl">
        This is the source of truth the AI scores photographs against and writes captions from. Competitor accounts
        are reference only — this page is what makes the output sound like you, not them.
      </p>
      <BrandForm
        defaults={
          brand
            ? {
                name: brand.name,
                description: brand.description ?? undefined,
                targetCustomer: brand.targetCustomer ?? undefined,
                luxuryLevel: brand.luxuryLevel,
                positioning: brand.positioning ?? undefined,
                visualStyle: brand.visualStyle,
                preferredColors: brand.preferredColors,
                photographyStyle: brand.photographyStyle,
                writingStyle: brand.writingStyle,
                wordsToUse: brand.wordsToUse,
                wordsToAvoid: brand.wordsToAvoid,
                primaryLocations: brand.primaryLocations,
              }
            : { name: session.user.organizationName, luxuryLevel: 8 }
        }
      />
    </div>
  );
}
