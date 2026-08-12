"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/weddings", label: "Weddings" },
  { href: "/photo-library", label: "Photo Library" },
  { href: "/curation", label: "AI Curation" },
  { href: "/competitors", label: "Competitor Intelligence" },
  { href: "/content-studio", label: "Content Studio" },
  { href: "/calendar", label: "Content Calendar" },
  { href: "/brand", label: "Brand Settings" },
  { href: "/analytics", label: "Analytics" },
];

export function Sidebar({
  organizationName,
  userName,
}: {
  organizationName: string;
  userName?: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-hairline bg-ivory min-h-screen flex flex-col">
      <div className="px-7 pt-9 pb-8">
        <p className="eyebrow">Wedding Marketing</p>
        <p className="eyebrow">Intelligence</p>
        <p className="font-serif text-lg mt-4 truncate">{organizationName}</p>
      </div>
      <nav className="flex-1 px-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2.5 font-sans text-sm tracking-wide transition-colors ${
                active ? "bg-paper text-ink border-l-2 border-gold pl-[10px]" : "text-ink-soft hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-7 py-6 border-t border-hairline">
        <p className="font-sans text-xs text-ink-soft mb-2 truncate">{userName}</p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="eyebrow text-ink-soft hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
