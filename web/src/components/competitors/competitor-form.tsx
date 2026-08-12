"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Input, Select, Textarea, FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { createCompetitorAction } from "@/app/actions/competitors";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add account"}
    </Button>
  );
}

export function CompetitorForm() {
  const [state, formAction] = useFormState(createCompetitorAction, {});

  return (
    <form action={formAction} className="space-y-5 max-w-xl">
      <FieldGroup label="Account name" htmlFor="accountName">
        <Input id="accountName" name="accountName" required placeholder="Studio name" />
      </FieldGroup>
      <FieldGroup label="Instagram URL" htmlFor="instagramUrl">
        <Input id="instagramUrl" name="instagramUrl" placeholder="https://instagram.com/handle" />
      </FieldGroup>
      <div className="grid grid-cols-2 gap-5">
        <FieldGroup label="Account type" htmlFor="accountType">
          <Select id="accountType" name="accountType" defaultValue="OTHER">
            <option value="PLANNER">Planner</option>
            <option value="STYLIST">Stylist</option>
            <option value="PHOTOGRAPHER">Photographer</option>
            <option value="VENUE">Venue</option>
            <option value="DECORATOR">Decorator</option>
            <option value="FLORIST">Florist</option>
            <option value="OTHER">Other</option>
          </Select>
        </FieldGroup>
        <FieldGroup label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="MEDIUM">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </Select>
        </FieldGroup>
      </div>
      <FieldGroup label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} />
      </FieldGroup>
      {state?.error && <p className="text-sm text-reject font-sans">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
