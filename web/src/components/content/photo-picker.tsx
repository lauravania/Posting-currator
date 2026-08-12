"use client";

import { useState } from "react";
import Image from "next/image";

export type PickablePhoto = {
  id: string;
  thumbnailUrl: string;
  totalScore: number | null;
  verdict: string | null;
};

export function PhotoPicker({ photos, defaultSelected = [] }: { photos: PickablePhoto[]; defaultSelected?: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-[420px] overflow-y-auto scrollbar-thin p-1">
        {photos.map((p) => {
          const isSelected = selected.has(p.id);
          return (
            <label key={p.id} className={`relative block aspect-[4/5] cursor-pointer border ${isSelected ? "border-gold" : "border-hairline"}`}>
              <input
                type="checkbox"
                name="photoIds"
                value={p.id}
                defaultChecked={isSelected}
                onChange={(e) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(p.id);
                    else next.delete(p.id);
                    return next;
                  });
                }}
                className="absolute top-1.5 left-1.5 z-10 w-4 h-4"
              />
              <Image src={p.thumbnailUrl} alt="" fill sizes="150px" className="object-cover" />
              {p.totalScore != null && (
                <span className="absolute bottom-1 right-1 bg-ivory/90 text-[10px] font-sans px-1.5 py-0.5">
                  {p.totalScore.toFixed(1)}
                </span>
              )}
            </label>
          );
        })}
      </div>
      <p className="font-sans text-xs text-ink-soft mt-2">{selected.size} selected</p>
    </div>
  );
}
