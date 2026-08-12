"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function WeddingTabs({ weddingId }: { weddingId: string }) {
  const pathname = usePathname();
  const base = `/weddings/${weddingId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/photos`, label: "Photo Library" },
    { href: `${base}/curation`, label: "AI Curation" },
    { href: `${base}/content`, label: "Content Studio" },
    { href: `${base}/vendors`, label: "Vendors" },
    { href: `${base}/settings`, label: "Edit" },
  ];

  return (
    <div className="border-b border-hairline flex gap-8 font-sans text-sm">
      {tabs.map((tab) => {
        const active = tab.href === base ? pathname === base : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`pb-3 -mb-px border-b-2 transition-colors ${
              active ? "border-gold text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
