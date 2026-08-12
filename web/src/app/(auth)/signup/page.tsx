"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input, FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { signupAction, type SignupState } from "@/app/actions/auth";

const initialState: SignupState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creating studio…" : "Create studio account"}
    </Button>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const credentials = useRef<{ email: string; password: string } | null>(null);

  async function wrappedAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
    const result = await signupAction(_prev, formData);
    if (!result.error) {
      credentials.current = {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      };
      setSigningIn(true);
      const creds = credentials.current;
      const signInResult = await signIn("credentials", {
        email: creds.email,
        password: creds.password,
        redirect: false,
      });
      if (!signInResult?.error) {
        router.push("/dashboard");
        router.refresh();
        return {};
      }
      setSigningIn(false);
      return { error: "Account created — please sign in." };
    }
    return result;
  }

  const [state, formAction] = useFormState(wrappedAction, initialState);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ivory px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-12">
          <p className="eyebrow mb-3">Wedding Marketing Intelligence</p>
          <h1 className="font-serif text-3xl">Set up your studio</h1>
          <p className="font-sans text-sm text-ink-soft mt-3">
            One account per organization. Invite teammates later from Brand Settings.
          </p>
        </div>
        <form action={formAction} className="space-y-5">
          <FieldGroup label="Studio / brand name" htmlFor="organizationName">
            <Input id="organizationName" name="organizationName" required placeholder="Bali Eve Wedding Planner" />
          </FieldGroup>
          <FieldGroup label="Your name" htmlFor="name">
            <Input id="name" name="name" required />
          </FieldGroup>
          <FieldGroup label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </FieldGroup>
          <FieldGroup label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
          </FieldGroup>
          {state?.error && <p className="text-sm text-reject font-sans">{state.error}</p>}
          <SubmitButton />
          {signingIn && <p className="text-xs font-sans text-ink-soft text-center">Signing you in…</p>}
        </form>
        <p className="text-center mt-8 text-sm font-sans text-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="text-ink underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
