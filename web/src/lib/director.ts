import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/lib/ai";
import OpenAI from "openai";

/**
 * AI Marketing Director (§17). Every answer is grounded in the
 * organization's actual database — weddings, photo scores, content
 * pipeline status, and (if present) analytics. In Demo Mode we answer a
 * fixed set of the brief's example questions directly from real queries;
 * anything else gets an honest "ask one of these, or connect
 * OPENAI_API_KEY for open-ended questions" rather than a fabricated
 * answer. With a key configured, the same real context is handed to the
 * model as grounding instead of letting it guess.
 */

async function gatherContext(organizationId: string) {
  const [weddings, topUnused, pendingCounts, posts, brand] = await Promise.all([
    prisma.wedding.findMany({
      where: { organizationId },
      include: { _count: { select: { photos: true, contentPosts: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.photo.findMany({
      where: { wedding: { organizationId }, analysis: { verdict: "KEEP" } },
      include: { analysis: true, wedding: true },
      orderBy: { analysis: { totalScore: "desc" } },
      take: 10,
    }),
    prisma.photo.groupBy({
      by: ["weddingId"],
      where: { wedding: { organizationId }, analysis: null },
      _count: true,
    }),
    prisma.contentPost.findMany({
      where: { wedding: { organizationId } },
      orderBy: { updatedAt: "desc" },
      take: 15,
      include: { wedding: true },
    }),
    prisma.brand.findUnique({ where: { organizationId } }),
  ]);

  const unusedTop = await filterUnused(topUnused, organizationId);

  return { weddings, topUnused: unusedTop, pendingCounts, posts, brand };
}

async function filterUnused(
  photos: Awaited<ReturnType<typeof prisma.photo.findMany<{ include: { analysis: true; wedding: true } }>>>,
  organizationId: string
) {
  const used = new Set(
    (
      await prisma.contentPostImage.findMany({
        where: { photo: { wedding: { organizationId } } },
        select: { photoId: true },
      })
    ).map((r) => r.photoId)
  );
  return photos.filter((p) => !used.has(p.id));
}

function formatUnusedList(photos: Awaited<ReturnType<typeof gatherContext>>["topUnused"]) {
  if (photos.length === 0) return "You have no unused KEEP-rated photographs right now — everything strong has already been drafted into a post.";
  return photos
    .slice(0, 10)
    .map((p, i) => `${i + 1}. ${p.wedding.coupleName} — score ${p.analysis!.totalScore.toFixed(1)}, categories: ${p.categories.join(", ") || "uncategorized"}`)
    .join("\n");
}

function ruleBasedAnswer(question: string, ctx: Awaited<ReturnType<typeof gatherContext>>): string | null {
  const q = question.toLowerCase();

  if (/strongest unused|10 strongest|top.*(photo|photograph)/.test(q)) {
    return `Your strongest unused photographs across the library:\n\n${formatUnusedList(ctx.topUnused)}`;
  }

  if (/what.*post.*week|this week/.test(q)) {
    if (ctx.topUnused.length === 0) {
      return "You don't have unused KEEP photos queued right now — run AI Curation on a wedding's photo library, or check Content Studio for existing drafts ready to schedule.";
    }
    const grouped = new Map<string, typeof ctx.topUnused>();
    for (const p of ctx.topUnused) {
      const key = p.wedding.coupleName;
      grouped.set(key, [...(grouped.get(key) ?? []), p]);
    }
    const [bestWedding, photos] = Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length)[0];
    return `Start with ${bestWedding} — you have ${photos.length} unused keeper${photos.length === 1 ? "" : "s"} scoring above your keep threshold there. Go to that wedding's Content Studio and run "Detect content opportunities" to get concept + caption drafts, or build a post manually from these: ${photos
      .slice(0, 5)
      .map((p) => p.categories[0] ?? "detail")
      .join(", ")}.`;
  }

  if (/which wedding.*prioriti|prioriti.*wedding/.test(q)) {
    const withPending = ctx.pendingCounts.filter((p) => p._count > 0);
    if (withPending.length > 0) {
      const wedding = ctx.weddings.find((w) => w.id === withPending[0].weddingId);
      return `${wedding?.coupleName ?? "A wedding"} has ${withPending[0]._count} photo(s) still awaiting AI analysis — run curation there first so nothing strong stays hidden.`;
    }
    const byUnused = new Map<string, number>();
    for (const p of ctx.topUnused) byUnused.set(p.wedding.coupleName, (byUnused.get(p.wedding.coupleName) ?? 0) + 1);
    const top = Array.from(byUnused.entries()).sort((a, b) => b[1] - a[1])[0];
    return top
      ? `${top[0]} — it has the most unused, high-scoring content sitting idle (${top[1]} photo${top[1] === 1 ? "" : "s"}).`
      : "All weddings are current — no clear content backlog to prioritize.";
  }

  if (/missing from my feed|content.*missing/.test(q)) {
    const allCategories = new Set(ctx.posts.map((p) => p.format));
    const missingFormats = (["SINGLE_IMAGE", "CAROUSEL", "REEL", "STORY"] as const).filter((f) => !allCategories.has(f));
    if (missingFormats.length === 0) return "Your recent posts already span every format — no obvious gap there. Consider reviewing category balance in the Photo Library instead.";
    return `You haven't published in these formats recently: ${missingFormats.join(", ").replace(/_/g, " ")}. That's a straightforward gap to close from your existing curated photos.`;
  }

  if (/why isn.?t my instagram growing|not growing|isn't growing/.test(q)) {
    return "There's no connected Instagram/Meta Graph API data yet, so I can't diagnose growth from real engagement numbers — that's an honest limitation, not something I'll guess at. Once Analytics has real data (or the platform integration is connected), I can identify which content types and posting times are underperforming.";
  }

  if (/7.day|seven.day|content plan/.test(q)) {
    if (ctx.topUnused.length === 0) return "Not enough unused curated content to build a 7-day plan yet — curate more photos first.";
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const plan = ctx.topUnused.slice(0, 7).map((p, i) => `${days[i]}: ${p.wedding.coupleName} — ${p.categories[0] ?? "editorial"} (score ${p.analysis!.totalScore.toFixed(1)})`);
    return `A 7-day plan from your current unused keepers:\n\n${plan.join("\n")}\n\nGenerate full captions for each from that wedding's Content Studio.`;
  }

  if (/which competitor|competitor.*learn/.test(q)) {
    return "Open Competitor Intelligence and check the pattern analysis on each tracked account — the one with the tightest posting cadence and highest caption/CTA consistency is usually the one worth studying structurally (never for wording).";
  }

  return null;
}

export async function askDirector(organizationId: string, question: string): Promise<{ answer: string; grounded: boolean }> {
  const ctx = await gatherContext(organizationId);
  const ruleAnswer = ruleBasedAnswer(question, ctx);

  if (isDemoMode()) {
    if (ruleAnswer) return { answer: ruleAnswer, grounded: true };
    return {
      answer:
        "Demo Mode only answers a fixed set of grounded questions without a connected model (see the suggestions below). Add OPENAI_API_KEY to ask anything, still grounded in your real wedding/photo/content data.",
      grounded: false,
    };
  }

  // Live mode: hand the model the same real context as grounding, whether
  // or not the rule-based path also matched.
  const apiKey = process.env.OPENAI_API_KEY;
  const openai = new OpenAI({ apiKey });
  const contextSummary = `
Weddings (${ctx.weddings.length}): ${ctx.weddings.map((w) => `${w.coupleName} (${w._count.photos} photos, ${w._count.contentPosts} posts)`).join("; ")}
Top unused keeper photos: ${formatUnusedList(ctx.topUnused)}
Recent content posts: ${ctx.posts.map((p) => `${p.title ?? "untitled"} [${p.status}]`).join("; ") || "none yet"}
Brand: ${ctx.brand?.name ?? "unnamed"} — positioning: ${ctx.brand?.positioning ?? "n/a"}
`.trim();

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are the AI Marketing Director for a luxury wedding brand's internal tool. Answer only from the real account data provided below — never invent statistics, followers, or analytics you weren't given. If the data doesn't support an answer, say so plainly.",
      },
      { role: "user", content: `Account data:\n${contextSummary}\n\nQuestion: ${question}` },
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim();
  return { answer: answer || ruleAnswer || "I couldn't generate an answer from the available data.", grounded: true };
}

export { SUGGESTED_QUESTIONS } from "./director-questions";
