/**
 * Tag/collaboration recommendation engine (§12). Rule-based mapping from
 * photo categories -> vendor category, so recommendations are explainable
 * and don't depend on a live model call.
 */

const CATEGORY_TO_VENDOR_CATEGORY: Record<string, string[]> = {
  "Couple portrait": ["photographer"],
  Bridal: ["photographer", "dress designer", "makeup artist"],
  Groom: ["photographer"],
  Ceremony: ["planner", "photographer", "florist"],
  Reception: ["planner", "decorator"],
  Tablescape: ["decorator", "florist", "stationery"],
  Decor: ["decorator", "florist"],
  Floral: ["florist"],
  Venue: ["venue", "planner"],
  Architecture: ["venue"],
  Details: ["decorator", "stationery"],
  Stationery: ["stationery"],
  Food: ["catering"],
  Entertainment: ["dj", "band", "entertainment"],
  "Dance floor": ["dj", "band"],
  "Getting ready": ["makeup artist", "hair stylist"],
  "Behind the scenes": ["planner"],
};

export type VendorLite = { id: string; name: string; category: string; instagramHandle: string | null };

export function recommendVendorTags(categories: string[], vendors: VendorLite[]) {
  const wantedCategories = new Set<string>();
  for (const c of categories) {
    for (const v of CATEGORY_TO_VENDOR_CATEGORY[c] ?? []) wantedCategories.add(v.toLowerCase());
  }

  const matches = vendors.filter((v) => wantedCategories.has(v.category.toLowerCase()));
  const primary = matches[0] ?? null;

  return {
    recommended: matches,
    primaryCollaborator: primary,
    reason: primary
      ? `This post features ${categories.slice(0, 2).join(" and ").toLowerCase()} content, which is ${primary.category.toLowerCase()} work — tagging ${primary.name} credits the right partner and extends reach into their audience.`
      : "No vendor in this wedding's team matches the featured categories yet — add vendors from the Vendors tab to get tagging suggestions.",
  };
}
