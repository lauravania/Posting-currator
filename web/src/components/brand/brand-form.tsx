"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Input, Textarea, FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { updateBrandAction } from "@/app/actions/brand";

type BrandDefaults = {
  name: string;
  description?: string;
  targetCustomer?: string;
  luxuryLevel: number;
  positioning?: string;
  visualStyle?: string[];
  preferredColors?: string[];
  photographyStyle?: string[];
  writingStyle?: string[];
  wordsToUse?: string[];
  wordsToAvoid?: string[];
  primaryLocations?: string[];
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save brand direction"}
    </Button>
  );
}

export function BrandForm({ defaults }: { defaults: BrandDefaults }) {
  const [state, formAction] = useFormState(updateBrandAction, {});

  return (
    <form action={formAction} className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FieldGroup label="Brand name" htmlFor="name">
          <Input id="name" name="name" required defaultValue={defaults.name} />
        </FieldGroup>
        <FieldGroup label="Luxury level (1-10)" htmlFor="luxuryLevel">
          <Input id="luxuryLevel" name="luxuryLevel" type="number" min={1} max={10} defaultValue={defaults.luxuryLevel} />
        </FieldGroup>
      </div>

      <FieldGroup label="Brand description" htmlFor="description">
        <Textarea id="description" name="description" rows={3} defaultValue={defaults.description} />
      </FieldGroup>
      <FieldGroup label="Target customer" htmlFor="targetCustomer">
        <Textarea id="targetCustomer" name="targetCustomer" rows={2} defaultValue={defaults.targetCustomer} />
      </FieldGroup>
      <FieldGroup label="Positioning statement" htmlFor="positioning">
        <Textarea
          id="positioning"
          name="positioning"
          rows={2}
          defaultValue={defaults.positioning}
          placeholder="Luxury, elegant, editorial, sophisticated, emotional, destination-wedding focused."
        />
      </FieldGroup>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FieldGroup label="Visual style (comma separated)" htmlFor="visualStyle">
          <Input id="visualStyle" name="visualStyle" defaultValue={defaults.visualStyle?.join(", ")} placeholder="luxury, editorial, timeless, architectural" />
        </FieldGroup>
        <FieldGroup label="Preferred colors (names or hex, comma separated)" htmlFor="preferredColors">
          <Input id="preferredColors" name="preferredColors" defaultValue={defaults.preferredColors?.join(", ")} placeholder="ivory, gold, sage" />
        </FieldGroup>
        <FieldGroup label="Preferred photography style" htmlFor="photographyStyle">
          <Input id="photographyStyle" name="photographyStyle" defaultValue={defaults.photographyStyle?.join(", ")} placeholder="natural light, candid, architectural" />
        </FieldGroup>
        <FieldGroup label="Preferred writing style" htmlFor="writingStyle">
          <Input id="writingStyle" name="writingStyle" defaultValue={defaults.writingStyle?.join(", ")} placeholder="editorial, emotional, understated" />
        </FieldGroup>
        <FieldGroup label="Words to use" htmlFor="wordsToUse">
          <Input id="wordsToUse" name="wordsToUse" defaultValue={defaults.wordsToUse?.join(", ")} />
        </FieldGroup>
        <FieldGroup label="Words to avoid" htmlFor="wordsToAvoid">
          <Input id="wordsToAvoid" name="wordsToAvoid" defaultValue={defaults.wordsToAvoid?.join(", ")} placeholder="dream wedding, cheap, generic" />
        </FieldGroup>
        <FieldGroup label="Primary locations" htmlFor="primaryLocations">
          <Input id="primaryLocations" name="primaryLocations" defaultValue={defaults.primaryLocations?.join(", ")} placeholder="Bali, Indonesia" />
        </FieldGroup>
      </div>

      {state?.error && <p className="text-sm text-reject font-sans">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
