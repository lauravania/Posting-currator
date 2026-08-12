import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-ivory hover:bg-ink/85 border border-ink",
  secondary: "bg-transparent text-ink border border-ink hover:bg-ink hover:text-ivory",
  ghost: "bg-transparent text-ink-soft border border-transparent hover:text-ink hover:border-hairline",
  danger: "bg-transparent text-reject border border-reject/40 hover:bg-reject hover:text-ivory",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`font-sans eyebrow !tracking-[0.12em] !text-[0.7rem] px-5 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  );
}
