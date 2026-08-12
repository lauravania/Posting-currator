import { SectionHeading } from "@/components/ui/stat";
import { CompetitorForm } from "@/components/competitors/competitor-form";

export default function NewCompetitorPage() {
  return (
    <div>
      <SectionHeading eyebrow="Competitor Intelligence" title="Add a reference account" />
      <CompetitorForm />
    </div>
  );
}
