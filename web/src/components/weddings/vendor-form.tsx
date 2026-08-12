"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Input, Select, FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/app/actions/weddings";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add vendor"}
    </Button>
  );
}

export function VendorForm({ action }: { action: (prevState: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end border border-hairline p-6">
      <FieldGroup label="Name" htmlFor="name">
        <Input id="name" name="name" required />
      </FieldGroup>
      <FieldGroup label="Category" htmlFor="category">
        <Input id="category" name="category" required placeholder="Photographer" />
      </FieldGroup>
      <FieldGroup label="Instagram handle" htmlFor="instagramHandle">
        <Input id="instagramHandle" name="instagramHandle" placeholder="@handle" />
      </FieldGroup>
      <FieldGroup label="Website" htmlFor="website">
        <Input id="website" name="website" />
      </FieldGroup>
      <FieldGroup label="Location" htmlFor="location">
        <Input id="location" name="location" />
      </FieldGroup>
      <FieldGroup label="Relationship" htmlFor="relationship">
        <Select id="relationship" name="relationship" defaultValue="ONE_OFF">
          <option value="PARTNER">Partner</option>
          <option value="CLIENT_HIRED">Client-hired</option>
          <option value="ONE_OFF">One-off</option>
          <option value="IN_HOUSE">In-house</option>
        </Select>
      </FieldGroup>
      <FieldGroup label="Preferred tagging format" htmlFor="preferredTaggingFormat">
        <Input id="preferredTaggingFormat" name="preferredTaggingFormat" placeholder="@handle in first comment" />
      </FieldGroup>
      <div className="md:col-span-3">
        {state?.error && <p className="text-sm text-reject font-sans mb-3">{state.error}</p>}
        <SubmitButton />
      </div>
    </form>
  );
}
