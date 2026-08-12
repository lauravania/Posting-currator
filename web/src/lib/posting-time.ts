/**
 * Posting-time recommendation engine (§15). Honesty constraint: we only
 * claim confidence backed by actual data. With real Analytics rows for the
 * org, we compute from them. Without any, we say so plainly and return a
 * clearly-labeled industry-pattern estimate at low-to-moderate confidence
 * rather than a fabricated number.
 */

export type TimeRecommendation = {
  time: string; // "19:30"
  dayOfWeek: string | null;
  confidence: number; // 0-1
  reason: string;
  basis: "account_analytics" | "reference_patterns" | "industry_default";
};

export function recommendPostingTime(input: {
  analyticsSamples: { recordedAt: Date; engagementRate: number | null }[];
  competitorDayFrequency: { value: string; count: number }[];
  contentFormat: string;
}): TimeRecommendation {
  const { analyticsSamples, competitorDayFrequency } = input;

  const withEngagement = analyticsSamples.filter((s) => s.engagementRate != null);
  if (withEngagement.length >= 5) {
    const byHour = new Map<number, { sum: number; count: number }>();
    for (const s of withEngagement) {
      const hour = s.recordedAt.getHours();
      const bucket = byHour.get(hour) ?? { sum: 0, count: 0 };
      bucket.sum += s.engagementRate ?? 0;
      bucket.count += 1;
      byHour.set(hour, bucket);
    }
    let bestHour = 19;
    let bestAvg = -Infinity;
    for (const [hour, { sum, count }] of Array.from(byHour.entries())) {
      const avg = sum / count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestHour = hour;
      }
    }
    const confidence = Math.min(0.92, 0.5 + withEngagement.length / 50);
    return {
      time: `${String(bestHour).padStart(2, "0")}:00`,
      dayOfWeek: null,
      confidence,
      reason: `Based on ${withEngagement.length} recorded posts, your account's own engagement rate historically peaks around ${bestHour}:00.`,
      basis: "account_analytics",
    };
  }

  if (competitorDayFrequency.length > 0) {
    const topDay = competitorDayFrequency[0];
    return {
      time: "19:30",
      dayOfWeek: topDay.value,
      confidence: 0.45,
      reason: `You don't yet have enough of your own posting analytics to base this on. Your tracked reference accounts post most often on ${topDay.value}, and luxury wedding content generally sees evening engagement — treat this as a starting hypothesis, not a measured result.`,
      basis: "reference_patterns",
    };
  }

  return {
    time: "19:30",
    dayOfWeek: null,
    confidence: 0.35,
    reason:
      "No account analytics or reference posting-pattern data is available yet. This is a generic industry default for aspirational/luxury content (evening browsing hours) — connect Analytics or add reference accounts to get a real recommendation.",
    basis: "industry_default",
  };
}
