type CompetitorPostLike = {
  categories: string[];
  hashtags: string[];
  collaborators: string[];
  caption: string | null;
  format: string | null;
  postedAt: Date | null;
  ctaPattern: string | null;
};

function topN(items: string[], n: number): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function analyzeCompetitorPosts(posts: CompetitorPostLike[]) {
  if (posts.length === 0) return null;

  const topCategories = topN(posts.flatMap((p) => p.categories), 5);
  const topHashtags = topN(posts.flatMap((p) => p.hashtags), 10);
  const topCollaborators = topN(posts.flatMap((p) => p.collaborators), 5);
  const topFormats = topN(posts.map((p) => p.format).filter((f): f is string => !!f), 4);
  const topCtas = topN(posts.map((p) => p.ctaPattern).filter((c): c is string => !!c), 5);

  const captionLengths = posts.map((p) => p.caption?.length ?? 0).filter((n) => n > 0);
  const avgCaptionLength = captionLengths.length
    ? Math.round(captionLengths.reduce((a, b) => a + b, 0) / captionLengths.length)
    : null;

  const postedDates = posts.map((p) => p.postedAt).filter((d): d is Date => !!d);
  const dayFrequency = topN(postedDates.map((d) => DAY_NAMES[d.getDay()]), 7);

  let postingCadenceDays: number | null = null;
  if (postedDates.length >= 2) {
    const sorted = [...postedDates].sort((a, b) => a.getTime() - b.getTime());
    const spanDays = (sorted[sorted.length - 1].getTime() - sorted[0].getTime()) / (1000 * 60 * 60 * 24);
    postingCadenceDays = spanDays > 0 ? Math.round((spanDays / (sorted.length - 1)) * 10) / 10 : null;
  }

  return {
    topCategories,
    topHashtags,
    topCollaborators,
    topFormats,
    topCtas,
    avgCaptionLength,
    dayFrequency,
    postingCadenceDays,
    sampleSize: posts.length,
  };
}
