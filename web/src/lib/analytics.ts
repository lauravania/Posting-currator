/**
 * §16 Analytics. There is no live Instagram/Meta Graph API connection in
 * this MVP, so every number here comes from Analytics rows a human entered
 * manually (see actions/analytics.ts) — never simulated. Breakdown
 * comparisons ("X generates Y% more saves than Z") are only computed when
 * there are at least MIN_SAMPLE posts in both groups being compared, so a
 * single data point never gets reported as a pattern.
 */

const MIN_SAMPLE = 3;

type AnalyticsRow = {
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  profileVisits: number | null;
  followersGained: number | null;
  engagementRate: number | null;
  contentPost: {
    format: string;
    tone: string;
    weddingId: string;
    wedding: { coupleName: string; photographer: string | null; venue: string | null };
    images: { photo: { categories: string[] } }[];
  } | null;
};

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function groupBy<T, K extends string>(rows: T[], keyFn: (row: T) => K | null): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (key === null) continue;
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

export function summarizeAnalytics(rows: AnalyticsRow[]) {
  const totals = {
    posts: rows.length,
    reach: rows.reduce((a, r) => a + (r.reach ?? 0), 0),
    impressions: rows.reduce((a, r) => a + (r.impressions ?? 0), 0),
    likes: rows.reduce((a, r) => a + (r.likes ?? 0), 0),
    comments: rows.reduce((a, r) => a + (r.comments ?? 0), 0),
    shares: rows.reduce((a, r) => a + (r.shares ?? 0), 0),
    saves: rows.reduce((a, r) => a + (r.saves ?? 0), 0),
    profileVisits: rows.reduce((a, r) => a + (r.profileVisits ?? 0), 0),
    followersGained: rows.reduce((a, r) => a + (r.followersGained ?? 0), 0),
    avgEngagementRate: avg(rows.map((r) => r.engagementRate).filter((n): n is number => n != null)),
  };

  const byFormat = groupBy(rows, (r) => r.contentPost?.format ?? null);
  const byTone = groupBy(rows, (r) => r.contentPost?.tone ?? null);
  const byWedding = groupBy(rows, (r) => r.contentPost?.wedding.coupleName ?? null);
  const byCategory = groupBy(
    rows.flatMap((r) => (r.contentPost?.images.flatMap((i) => i.photo.categories) ?? []).map((cat) => ({ ...r, __cat: cat }))),
    (r) => r.__cat
  );

  function scoreGroups(groups: Map<string, AnalyticsRow[]>) {
    return Array.from(groups.entries())
      .map(([key, group]) => ({
        key,
        sampleSize: group.length,
        avgEngagementRate: avg(group.map((g) => g.engagementRate).filter((n): n is number => n != null)),
        avgSaves: avg(group.map((g) => g.saves).filter((n): n is number => n != null)),
      }))
      .sort((a, b) => (b.avgEngagementRate ?? 0) - (a.avgEngagementRate ?? 0));
  }

  const formatBreakdown = scoreGroups(byFormat);
  const toneBreakdown = scoreGroups(byTone);
  const weddingBreakdown = scoreGroups(byWedding);
  const categoryBreakdown = scoreGroups(byCategory as unknown as Map<string, AnalyticsRow[]>);

  const sorted = [...rows]
    .filter((r) => r.engagementRate != null)
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));
  const best = sorted.slice(0, 3);
  const worst = sorted.slice(-3).reverse();

  const patterns: string[] = [];
  if (categoryBreakdown.length >= 2) {
    const [top, ...rest] = categoryBreakdown.filter((c) => c.sampleSize >= MIN_SAMPLE);
    const comparable = rest.find((c) => c.sampleSize >= MIN_SAMPLE);
    if (top && comparable && top.avgSaves != null && comparable.avgSaves != null && comparable.avgSaves > 0) {
      const pct = Math.round(((top.avgSaves - comparable.avgSaves) / comparable.avgSaves) * 100);
      if (Math.abs(pct) >= 10) {
        patterns.push(
          `Your "${top.key}" content generates ${pct > 0 ? pct : Math.abs(pct)}% ${pct > 0 ? "more" : "fewer"} saves on average than "${comparable.key}" (based on ${top.sampleSize} vs ${comparable.sampleSize} posts).`
        );
      }
    }
  }
  if (rows.length < MIN_SAMPLE) {
    patterns.push(`Only ${rows.length} post(s) have analytics logged — patterns need at least ${MIN_SAMPLE} per group to be reliable.`);
  }

  return { totals, formatBreakdown, toneBreakdown, weddingBreakdown, categoryBreakdown, best, worst, patterns };
}
