"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Input, Select, FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { createAnalyticsAction } from "@/app/actions/analytics";

type PostOption = { id: string; label: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Log analytics"}
    </Button>
  );
}

const FIELDS = ["reach", "impressions", "likes", "comments", "shares", "saves", "profileVisits", "followersGained"];

export function LogAnalyticsForm({ posts }: { posts: PostOption[] }) {
  const [state, formAction] = useFormState(createAnalyticsAction, {});

  return (
    <form action={formAction} className="border border-hairline p-6 space-y-5">
      <p className="eyebrow">Log performance manually (no platform API connected yet)</p>
      <FieldGroup label="Post" htmlFor="contentPostId">
        <Select id="contentPostId" name="contentPostId" required>
          <option value="">Select a published post…</option>
          {posts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </FieldGroup>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {FIELDS.map((f) => (
          <FieldGroup key={f} label={f.replace(/([A-Z])/g, " $1")} htmlFor={f}>
            <Input id={f} name={f} type="number" min={0} />
          </FieldGroup>
        ))}
      </div>
      {state?.error && <p className="text-sm text-reject font-sans">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
