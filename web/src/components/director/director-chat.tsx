"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef } from "react";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { askDirectorAction } from "@/app/actions/director";
import { SUGGESTED_QUESTIONS } from "@/lib/director-questions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Thinking…" : "Ask"}
    </Button>
  );
}

export function DirectorChat() {
  const [state, formAction] = useFormState(askDirectorAction, {});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              if (textareaRef.current) {
                textareaRef.current.value = q;
                textareaRef.current.focus();
              }
            }}
            className="font-sans text-xs border border-hairline px-3 py-1.5 hover:border-gold"
          >
            {q}
          </button>
        ))}
      </div>
      <form action={formAction} className="space-y-4">
        <Textarea ref={textareaRef} name="question" rows={2} placeholder="Ask your AI Marketing Director…" required />
        {state?.error && <p className="text-sm text-reject font-sans">{state.error}</p>}
        <SubmitButton />
      </form>
    </div>
  );
}
