"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Input, Select, Textarea, FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/app/actions/weddings";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add reference post"}
    </Button>
  );
}

export function CompetitorPostForm({ action }: { action: (prevState: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="space-y-5 border border-hairline p-6">
      <p className="eyebrow">Add reference content — screenshot upload, URL, or a manual note</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FieldGroup label="Screenshot (optional)" htmlFor="screenshot">
          <Input id="screenshot" name="screenshot" type="file" accept="image/jpeg,image/png,image/webp" />
        </FieldGroup>
        <FieldGroup label="Source URL (optional)" htmlFor="sourceUrl">
          <Input id="sourceUrl" name="sourceUrl" placeholder="https://instagram.com/p/..." />
        </FieldGroup>
      </div>
      <FieldGroup label="Caption text (for structure analysis only — never reused verbatim)" htmlFor="caption">
        <Textarea id="caption" name="caption" rows={3} />
      </FieldGroup>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <FieldGroup label="Posted date" htmlFor="postedAt">
          <Input id="postedAt" name="postedAt" type="date" />
        </FieldGroup>
        <FieldGroup label="Format" htmlFor="format">
          <Select id="format" name="format" defaultValue="">
            <option value="">Unspecified</option>
            <option value="SINGLE_IMAGE">Single image</option>
            <option value="CAROUSEL">Carousel</option>
            <option value="REEL">Reel</option>
            <option value="STORY">Story</option>
          </Select>
        </FieldGroup>
        <FieldGroup label="CTA pattern" htmlFor="ctaPattern">
          <Input id="ctaPattern" name="ctaPattern" placeholder="e.g. 'DM to enquire'" />
        </FieldGroup>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <FieldGroup label="Categories (comma separated)" htmlFor="categories">
          <Input id="categories" name="categories" placeholder="Couple portrait, Venue" />
        </FieldGroup>
        <FieldGroup label="Hashtags (comma separated)" htmlFor="hashtags">
          <Input id="hashtags" name="hashtags" placeholder="#BaliWedding, #DestinationWedding" />
        </FieldGroup>
        <FieldGroup label="Collaborators tagged (comma separated)" htmlFor="collaborators">
          <Input id="collaborators" name="collaborators" placeholder="@venue, @florist" />
        </FieldGroup>
      </div>
      <FieldGroup label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} />
      </FieldGroup>
      {state?.error && <p className="text-sm text-reject font-sans">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
