"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Select, FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
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
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Regenerating…" : "Regenerate caption"}
    </Button>
  );
}

export function RegenerateCaptionForm({
  action,
  currentTone,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  currentTone: string;
}) {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="flex items-end gap-3">
      <FieldGroup label="Tone" htmlFor="tone">
        <Select id="tone" name="tone" defaultValue={currentTone}>
          {TONES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FieldGroup>
      <SubmitButton />
      {state?.error && <p className="text-xs text-reject font-sans">{state.error}</p>}
    </form>
  );
}
