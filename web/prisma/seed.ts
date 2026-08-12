import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Seeds the example account from the brief (§2): a luxury destination
// wedding planner in Bali, with brand direction pre-filled and one wedding
// project ready to upload photos into.
async function main() {
  const email = "demo@balieve.studio";
  const password = "demo12345";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Demo user already exists (${email}). Skipping seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const org = await prisma.organization.create({
    data: { name: "Bali Eve Wedding Planner", slug: "bali-eve" },
  });

  const user = await prisma.user.create({
    data: { email, name: "Studio Demo", passwordHash },
  });

  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });

  await prisma.brand.create({
    data: {
      organizationId: org.id,
      name: "Bali Eve",
      description: "A luxury destination wedding planning and styling studio based in Bali, Indonesia.",
      targetCustomer: "Affluent international couples planning a multi-day luxury destination wedding in Bali.",
      luxuryLevel: 9,
      positioning: "Luxury, elegant, editorial, sophisticated, emotional, destination-wedding focused.",
      visualStyle: ["luxury", "editorial", "timeless", "sophisticated", "architectural", "romantic", "destination wedding", "minimal but rich"],
      preferredColors: ["ivory", "sand", "gold", "sage", "ocean blue"],
      photographyStyle: ["natural light", "candid", "architectural", "editorial"],
      writingStyle: ["editorial", "emotional", "understated", "storytelling"],
      wordsToUse: ["considered", "editorial", "timeless", "intimate", "destination"],
      wordsToAvoid: ["generic wedding language", "overly cheesy copy", "excessive emojis", "cheap-looking visual trends", "dream wedding"],
      primaryLocations: ["Bali, Indonesia"],
    },
  });

  const wedding = await prisma.wedding.create({
    data: {
      organizationId: org.id,
      coupleName: "Amara & Theo",
      weddingDate: new Date("2026-06-14"),
      venue: "Alila Villas Uluwatu",
      location: "Uluwatu, Bali",
      planner: "Bali Eve",
      stylist: "Bali Eve Styling",
      decorator: "Ubud Botanica",
      photographer: "Kadek Wirawan",
      videographer: "Studio Lens Bali",
      makeupArtist: "Made Ayu",
      florist: "Ubud Botanica",
      dressDesigner: "Vera Kai Atelier",
      description: "A three-day celebration overlooking the Indian Ocean, blending Balinese ceremony with modern editorial styling.",
      coupleStory: "Amara and Theo met on a diving trip off Nusa Penida and returned to Uluwatu to marry above the same cliffs.",
      concept: "An intimate modern celebration overlooking the Indian Ocean.",
      colorPalette: ["ivory", "sage", "gold"],
      designKeywords: ["minimal", "architectural", "oceanfront", "editorial"],
      targetAudience: "International couples seeking a luxury, editorial-style destination wedding.",
    },
  });

  await prisma.vendor.createMany({
    data: [
      { weddingId: wedding.id, name: "Kadek Wirawan", category: "photographer", instagramHandle: "@kadekwirawan", relationship: "PARTNER" },
      { weddingId: wedding.id, name: "Ubud Botanica", category: "florist", instagramHandle: "@ubudbotanica", relationship: "PARTNER" },
      { weddingId: wedding.id, name: "Alila Villas Uluwatu", category: "venue", instagramHandle: "@alilavillasuluwatu", relationship: "ONE_OFF" },
      { weddingId: wedding.id, name: "Studio Lens Bali", category: "videographer", instagramHandle: "@studiolensbali", relationship: "ONE_OFF" },
    ],
  });

  console.log("Seeded demo account:");
  console.log(`  email: ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  organization: ${org.name}`);
  console.log(`  wedding: ${wedding.coupleName} (${wedding.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
