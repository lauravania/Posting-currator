import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SectionHeading } from "@/components/ui/stat";
import { DirectorChat } from "@/components/director/director-chat";
import { isDemoMode } from "@/lib/ai";

export default async function DirectorPage() {
  const session = await requireSession();
  const history = await prisma.aIRecommendation.findMany({
    where: { organizationId: session.user.organizationId, kind: "chat" },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return (
    <div className="space-y-10 max-w-3xl">
      <SectionHeading eyebrow="AI Marketing Director" title="Ask about your business" />
      <p className="font-sans text-sm text-ink-soft -mt-6">
        {isDemoMode()
          ? "Demo Mode: answers come from your real data via the fixed question set below. Connect OPENAI_API_KEY for open-ended, still-grounded questions."
          : "Every answer is grounded in your actual weddings, photo scores, and content pipeline — never fabricated statistics."}
      </p>
      <DirectorChat />

      {history.length > 0 && (
        <div className="space-y-6 pt-6 border-t border-hairline">
          {history.map((h) => (
            <div key={h.id} className="font-sans text-sm">
              <p className="font-serif text-lg mb-1">{h.prompt}</p>
              <p className="text-ink-soft whitespace-pre-line">{h.response}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
