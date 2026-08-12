// Small named-color table used to translate raw RGB samples into
// human-readable palette words (for detectedColors / brand-fit comparison).
export const NAMED_COLORS: { name: string; rgb: [number, number, number] }[] = [
  { name: "ivory", rgb: [250, 247, 242] },
  { name: "champagne", rgb: [247, 231, 206] },
  { name: "sand", rgb: [219, 197, 160] },
  { name: "terracotta", rgb: [188, 108, 78] },
  { name: "blush", rgb: [232, 197, 194] },
  { name: "dusty rose", rgb: [196, 142, 143] },
  { name: "gold", rgb: [168, 137, 79] },
  { name: "olive", rgb: [110, 118, 74] },
  { name: "sage", rgb: [156, 172, 148] },
  { name: "emerald", rgb: [39, 90, 68] },
  { name: "teal", rgb: [40, 110, 110] },
  { name: "ocean blue", rgb: [46, 94, 122] },
  { name: "navy", rgb: [30, 42, 68] },
  { name: "charcoal", rgb: [45, 44, 42] },
  { name: "black", rgb: [15, 14, 13] },
  { name: "white", rgb: [252, 252, 250] },
  { name: "stone grey", rgb: [140, 137, 130] },
  { name: "burgundy", rgb: [96, 34, 42] },
  { name: "coral", rgb: [222, 122, 97] },
  { name: "sunset orange", rgb: [214, 118, 64] },
  { name: "warm brown", rgb: [107, 74, 51] },
];

export function nearestColorName(rgb: [number, number, number]): string {
  let best = NAMED_COLORS[0];
  let bestDist = Infinity;
  for (const c of NAMED_COLORS) {
    const d = (c.rgb[0] - rgb[0]) ** 2 + (c.rgb[1] - rgb[1]) ** 2 + (c.rgb[2] - rgb[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best.name;
}

export function colorDistance(a: [number, number, number], b: [number, number, number]) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// Best-effort parse of a brand "preferred color" entry (hex code or a name
// that happens to be in our table) into RGB, for brand-fit comparisons.
export function parseColorToRgb(input: string): [number, number, number] | null {
  const hex = input.trim().replace("#", "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const match = NAMED_COLORS.find((c) => c.name.toLowerCase() === input.trim().toLowerCase());
  return match ? match.rgb : null;
}
