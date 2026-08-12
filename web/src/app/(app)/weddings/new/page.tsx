import { SectionHeading } from "@/components/ui/stat";
import { WeddingForm } from "@/components/weddings/wedding-form";
import { createWeddingAction } from "@/app/actions/weddings";

export default function NewWeddingPage() {
  return (
    <div className="max-w-3xl">
      <SectionHeading eyebrow="Workspace" title="New wedding project" />
      <WeddingForm action={createWeddingAction} submitLabel="Create wedding" />
    </div>
  );
}
