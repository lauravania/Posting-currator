"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Input, Select, Textarea, FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/app/actions/weddings";

type Vendor = { id: string; name: string; category: string };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function PostEditorForm({
  action,
  vendors,
  defaults,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  vendors: Vendor[];
  defaults: {
    title: string;
    hook: string;
    caption: string;
    shortCaption: string;
    cta: string;
    hashtags: string[];
    status: string;
    scheduledFor: string;
    recommendedTime: string;
    collaborators: string[];
  };
}) {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="space-y-6">
      <FieldGroup label="Title" htmlFor="title">
        <Input id="title" name="title" defaultValue={defaults.title} />
      </FieldGroup>
      <FieldGroup label="Hook" htmlFor="hook">
        <Input id="hook" name="hook" defaultValue={defaults.hook} />
      </FieldGroup>
      <FieldGroup label="Caption" htmlFor="caption">
        <Textarea id="caption" name="caption" rows={6} defaultValue={defaults.caption} />
      </FieldGroup>
      <FieldGroup label="Short caption (Stories/Reels)" htmlFor="shortCaption">
        <Textarea id="shortCaption" name="shortCaption" rows={2} defaultValue={defaults.shortCaption} />
      </FieldGroup>
      <FieldGroup label="Call to action" htmlFor="cta">
        <Input id="cta" name="cta" defaultValue={defaults.cta} />
      </FieldGroup>
      <FieldGroup label="Hashtags (comma separated)" htmlFor="hashtags">
        <Textarea id="hashtags" name="hashtags" rows={2} defaultValue={defaults.hashtags.join(", ")} />
      </FieldGroup>

      <div>
        <p className="eyebrow mb-2">Collaborators to tag</p>
        <div className="flex flex-wrap gap-3 font-sans text-sm">
          {vendors.length === 0 && <p className="text-ink-soft text-xs">No vendors on this wedding yet.</p>}
          {vendors.map((v) => (
            <label key={v.id} className="flex items-center gap-2 border border-hairline px-3 py-1.5">
              <input type="checkbox" name="collaborators" value={v.id} defaultChecked={defaults.collaborators.includes(v.id)} />
              {v.name} <span className="text-ink-soft text-xs">({v.category})</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <FieldGroup label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={defaults.status}>
            <option value="IDEA">Idea</option>
            <option value="DRAFT">Draft</option>
            <option value="READY_FOR_APPROVAL">Ready for approval</option>
            <option value="APPROVED">Approved</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="PUBLISHED">Published</option>
          </Select>
        </FieldGroup>
        <FieldGroup label="Scheduled for" htmlFor="scheduledFor">
          <Input id="scheduledFor" name="scheduledFor" type="datetime-local" defaultValue={defaults.scheduledFor} />
        </FieldGroup>
        <FieldGroup label="Recommended time" htmlFor="recommendedTime">
          <Input id="recommendedTime" name="recommendedTime" defaultValue={defaults.recommendedTime} placeholder="19:30" />
        </FieldGroup>
      </div>

      {state?.error && <p className="text-sm text-reject font-sans">{state.error}</p>}
      <SaveButton />
    </form>
  );
}
