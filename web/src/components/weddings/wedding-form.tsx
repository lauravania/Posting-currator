"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Input, Textarea, FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/app/actions/weddings";

type WeddingDefaults = Partial<{
  coupleName: string;
  weddingDate: string;
  venue: string;
  location: string;
  planner: string;
  stylist: string;
  decorator: string;
  photographer: string;
  videographer: string;
  makeupArtist: string;
  florist: string;
  dressDesigner: string;
  otherVendors: string;
  description: string;
  coupleStory: string;
  concept: string;
  colorPalette: string[];
  designKeywords: string[];
  targetAudience: string;
}>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function WeddingForm({
  action,
  defaults,
  submitLabel = "Create wedding",
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  defaults?: WeddingDefaults;
  submitLabel?: string;
}) {
  const [state, formAction] = useFormState(action, {});
  const d = defaults ?? {};

  return (
    <form action={formAction} className="space-y-10">
      <section>
        <p className="eyebrow mb-4">The couple</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldGroup label="Couple name" htmlFor="coupleName">
            <Input id="coupleName" name="coupleName" required defaultValue={d.coupleName} placeholder="Amara & Theo" />
          </FieldGroup>
          <FieldGroup label="Wedding date" htmlFor="weddingDate">
            <Input id="weddingDate" name="weddingDate" type="date" defaultValue={d.weddingDate} />
          </FieldGroup>
          <FieldGroup label="Venue" htmlFor="venue">
            <Input id="venue" name="venue" defaultValue={d.venue} placeholder="Alila Villas Uluwatu" />
          </FieldGroup>
          <FieldGroup label="Location" htmlFor="location">
            <Input id="location" name="location" defaultValue={d.location} placeholder="Uluwatu, Bali" />
          </FieldGroup>
        </div>
      </section>

      <section>
        <p className="eyebrow mb-4">Vendor team</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldGroup label="Planner" htmlFor="planner">
            <Input id="planner" name="planner" defaultValue={d.planner} />
          </FieldGroup>
          <FieldGroup label="Stylist" htmlFor="stylist">
            <Input id="stylist" name="stylist" defaultValue={d.stylist} />
          </FieldGroup>
          <FieldGroup label="Decorator" htmlFor="decorator">
            <Input id="decorator" name="decorator" defaultValue={d.decorator} />
          </FieldGroup>
          <FieldGroup label="Photographer" htmlFor="photographer">
            <Input id="photographer" name="photographer" defaultValue={d.photographer} />
          </FieldGroup>
          <FieldGroup label="Videographer" htmlFor="videographer">
            <Input id="videographer" name="videographer" defaultValue={d.videographer} />
          </FieldGroup>
          <FieldGroup label="Makeup artist" htmlFor="makeupArtist">
            <Input id="makeupArtist" name="makeupArtist" defaultValue={d.makeupArtist} />
          </FieldGroup>
          <FieldGroup label="Florist" htmlFor="florist">
            <Input id="florist" name="florist" defaultValue={d.florist} />
          </FieldGroup>
          <FieldGroup label="Dress designer" htmlFor="dressDesigner">
            <Input id="dressDesigner" name="dressDesigner" defaultValue={d.dressDesigner} />
          </FieldGroup>
        </div>
        <div className="mt-5">
          <FieldGroup label="Other vendors" htmlFor="otherVendors">
            <Textarea id="otherVendors" name="otherVendors" rows={2} defaultValue={d.otherVendors} />
          </FieldGroup>
        </div>
      </section>

      <section>
        <p className="eyebrow mb-4">Creative direction</p>
        <div className="space-y-5">
          <FieldGroup label="Wedding description" htmlFor="description">
            <Textarea id="description" name="description" rows={3} defaultValue={d.description} />
          </FieldGroup>
          <FieldGroup label="Couple story" htmlFor="coupleStory">
            <Textarea id="coupleStory" name="coupleStory" rows={3} defaultValue={d.coupleStory} />
          </FieldGroup>
          <FieldGroup label="Wedding concept" htmlFor="concept">
            <Textarea id="concept" name="concept" rows={2} defaultValue={d.concept} />
          </FieldGroup>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FieldGroup label="Color palette (comma separated)" htmlFor="colorPalette">
              <Input id="colorPalette" name="colorPalette" defaultValue={d.colorPalette?.join(", ")} placeholder="ivory, sage, gold" />
            </FieldGroup>
            <FieldGroup label="Design keywords (comma separated)" htmlFor="designKeywords">
              <Input
                id="designKeywords"
                name="designKeywords"
                defaultValue={d.designKeywords?.join(", ")}
                placeholder="minimal, architectural, oceanfront"
              />
            </FieldGroup>
          </div>
          <FieldGroup label="Target audience" htmlFor="targetAudience">
            <Input id="targetAudience" name="targetAudience" defaultValue={d.targetAudience} />
          </FieldGroup>
        </div>
      </section>

      {state?.error && <p className="text-sm text-reject font-sans">{state.error}</p>}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
