"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Select, Textarea, FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { PhotoPicker, type PickablePhoto } from "./photo-picker";
import type { FormState } from "@/app/actions/weddings";

const TONES = [
  ["LUXURY_EDITORIAL", "Luxury Editorial"],
  ["EMOTIONAL", "Emotional"],
  ["MINIMAL", "Minimal"],
  ["STORYTELLING", "Storytelling"],
  ["FASHION_EDITORIAL", "Fashion Editorial"],
  ["SEO", "SEO"],
  ["PROFESSIONAL", "Professional"],
  ["PLAYFUL", "Playful"],
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Generating…" : "Generate post"}
    </Button>
  );
}

export function NewPostForm({
  action,
  photos,
  defaultSelected,
  defaultConcept,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  photos: PickablePhoto[];
  defaultSelected?: string[];
  defaultConcept?: string;
}) {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="space-y-6 border border-hairline p-6">
      <div>
        <p className="eyebrow mb-3">Select photographs</p>
        <PhotoPicker photos={photos} defaultSelected={defaultSelected} />
      </div>
      <FieldGroup label="Post concept" htmlFor="concept">
        <Textarea id="concept" name="concept" rows={2} defaultValue={defaultConcept} placeholder="An intimate modern celebration overlooking the Indian Ocean." />
      </FieldGroup>
      <div className="grid grid-cols-2 gap-5">
        <FieldGroup label="Tone" htmlFor="tone">
          <Select id="tone" name="tone" defaultValue="LUXURY_EDITORIAL">
            {TONES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldGroup>
        <FieldGroup label="Format" htmlFor="format">
          <Select id="format" name="format" defaultValue="CAROUSEL">
            <option value="SINGLE_IMAGE">Single image</option>
            <option value="CAROUSEL">Carousel</option>
            <option value="REEL">Reel</option>
            <option value="STORY">Story</option>
          </Select>
        </FieldGroup>
      </div>
      {state?.error && <p className="text-sm text-reject font-sans">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
