-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "VendorRelationship" AS ENUM ('PARTNER', 'CLIENT_HIRED', 'ONE_OFF', 'IN_HOUSE');

-- CreateEnum
CREATE TYPE "CurationVerdict" AS ENUM ('PENDING', 'KEEP', 'MAYBE', 'REJECT');

-- CreateEnum
CREATE TYPE "CompetitorAccountType" AS ENUM ('PLANNER', 'STYLIST', 'PHOTOGRAPHER', 'VENUE', 'DECORATOR', 'FLORIST', 'OTHER');

-- CreateEnum
CREATE TYPE "CompetitorPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CompetitorContentFormat" AS ENUM ('SINGLE_IMAGE', 'CAROUSEL', 'REEL', 'STORY');

-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('SINGLE_IMAGE', 'CAROUSEL', 'REEL', 'STORY');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('IDEA', 'DRAFT', 'READY_FOR_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "CaptionTone" AS ENUM ('LUXURY_EDITORIAL', 'EMOTIONAL', 'MINIMAL', 'STORYTELLING', 'FASHION_EDITORIAL', 'SEO', 'PROFESSIONAL', 'PLAYFUL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetCustomer" TEXT,
    "luxuryLevel" INTEGER NOT NULL DEFAULT 8,
    "visualStyle" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredColors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photographyStyle" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "writingStyle" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wordsToUse" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wordsToAvoid" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primaryLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "positioning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wedding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "coupleName" TEXT NOT NULL,
    "weddingDate" TIMESTAMP(3),
    "venue" TEXT,
    "location" TEXT,
    "planner" TEXT,
    "stylist" TEXT,
    "decorator" TEXT,
    "photographer" TEXT,
    "videographer" TEXT,
    "makeupArtist" TEXT,
    "florist" TEXT,
    "dressDesigner" TEXT,
    "otherVendors" TEXT,
    "description" TEXT,
    "coupleStory" TEXT,
    "concept" TEXT,
    "colorPalette" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "designKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetAudience" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instagramHandle" TEXT,
    "category" TEXT NOT NULL,
    "website" TEXT,
    "location" TEXT,
    "relationship" "VendorRelationship" NOT NULL DEFAULT 'ONE_OFF',
    "preferredTaggingFormat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "aspectRatio" DOUBLE PRECISION,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "detectedObjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "detectedPeopleCount" INTEGER,
    "detectedColors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedContentType" TEXT,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoAnalysis" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "sharpnessScore" DOUBLE PRECISION NOT NULL,
    "exposureScore" DOUBLE PRECISION NOT NULL,
    "noiseScore" DOUBLE PRECISION NOT NULL,
    "focusScore" DOUBLE PRECISION NOT NULL,
    "resolutionScore" DOUBLE PRECISION NOT NULL,
    "lightingScore" DOUBLE PRECISION NOT NULL,
    "motionBlurScore" DOUBLE PRECISION NOT NULL,
    "technicalScore" DOUBLE PRECISION NOT NULL,
    "framingScore" DOUBLE PRECISION NOT NULL,
    "balanceScore" DOUBLE PRECISION NOT NULL,
    "negativeSpaceScore" DOUBLE PRECISION NOT NULL,
    "subjectPlacementScore" DOUBLE PRECISION NOT NULL,
    "visualHierarchyScore" DOUBLE PRECISION NOT NULL,
    "architecturalScore" DOUBLE PRECISION NOT NULL,
    "compositionScore" DOUBLE PRECISION NOT NULL,
    "emotionalImpactScore" DOUBLE PRECISION NOT NULL,
    "editorialFeelingScore" DOUBLE PRECISION NOT NULL,
    "storytellingScore" DOUBLE PRECISION NOT NULL,
    "uniquenessScore" DOUBLE PRECISION NOT NULL,
    "editorialScore" DOUBLE PRECISION NOT NULL,
    "brandFitScore" DOUBLE PRECISION NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "verdict" "CurationVerdict" NOT NULL DEFAULT 'PENDING',
    "verdictReason" TEXT,
    "provider" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "instagramUrl" TEXT,
    "accountType" "CompetitorAccountType" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "priority" "CompetitorPriority" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorPost" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "screenshotKey" TEXT,
    "caption" TEXT,
    "postedAt" TIMESTAMP(3),
    "format" "CompetitorContentFormat",
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dominantColors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collaborators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ctaPattern" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentIdea" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "hook" TEXT,
    "format" "ContentFormat" NOT NULL DEFAULT 'CAROUSEL',
    "rationale" TEXT,
    "photoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "contentIdeaId" TEXT,
    "title" TEXT,
    "hook" TEXT,
    "caption" TEXT,
    "shortCaption" TEXT,
    "cta" TEXT,
    "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tone" "CaptionTone" NOT NULL DEFAULT 'LUXURY_EDITORIAL',
    "format" "ContentFormat" NOT NULL DEFAULT 'CAROUSEL',
    "collaborators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ContentStatus" NOT NULL DEFAULT 'IDEA',
    "recommendedDate" TIMESTAMP(3),
    "recommendedTime" TEXT,
    "timeConfidence" DOUBLE PRECISION,
    "timeReason" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPostImage" (
    "id" TEXT NOT NULL,
    "contentPostId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContentPostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HashtagSet" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HashtagSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analytics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentPostId" TEXT,
    "reach" INTEGER,
    "impressions" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "profileVisits" INTEGER,
    "followersGained" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "Analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRecommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "prompt" TEXT,
    "response" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_organizationId_key" ON "Brand"("organizationId");

-- CreateIndex
CREATE INDEX "Wedding_organizationId_idx" ON "Wedding"("organizationId");

-- CreateIndex
CREATE INDEX "Vendor_weddingId_idx" ON "Vendor"("weddingId");

-- CreateIndex
CREATE INDEX "Photo_weddingId_idx" ON "Photo"("weddingId");

-- CreateIndex
CREATE INDEX "Photo_weddingId_uploadedAt_idx" ON "Photo"("weddingId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAnalysis_photoId_key" ON "PhotoAnalysis"("photoId");

-- CreateIndex
CREATE INDEX "PhotoAnalysis_verdict_idx" ON "PhotoAnalysis"("verdict");

-- CreateIndex
CREATE INDEX "PhotoAnalysis_totalScore_idx" ON "PhotoAnalysis"("totalScore");

-- CreateIndex
CREATE INDEX "Competitor_organizationId_idx" ON "Competitor"("organizationId");

-- CreateIndex
CREATE INDEX "CompetitorPost_competitorId_idx" ON "CompetitorPost"("competitorId");

-- CreateIndex
CREATE INDEX "ContentIdea_weddingId_idx" ON "ContentIdea"("weddingId");

-- CreateIndex
CREATE INDEX "ContentPost_weddingId_idx" ON "ContentPost"("weddingId");

-- CreateIndex
CREATE INDEX "ContentPost_status_idx" ON "ContentPost"("status");

-- CreateIndex
CREATE INDEX "ContentPost_scheduledFor_idx" ON "ContentPost"("scheduledFor");

-- CreateIndex
CREATE INDEX "ContentPostImage_contentPostId_idx" ON "ContentPostImage"("contentPostId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPostImage_contentPostId_photoId_key" ON "ContentPostImage"("contentPostId", "photoId");

-- CreateIndex
CREATE INDEX "HashtagSet_organizationId_idx" ON "HashtagSet"("organizationId");

-- CreateIndex
CREATE INDEX "Analytics_organizationId_idx" ON "Analytics"("organizationId");

-- CreateIndex
CREATE INDEX "Analytics_contentPostId_idx" ON "Analytics"("contentPostId");

-- CreateIndex
CREATE INDEX "AIRecommendation_organizationId_idx" ON "AIRecommendation"("organizationId");

-- CreateIndex
CREATE INDEX "AIRecommendation_createdAt_idx" ON "AIRecommendation"("createdAt");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wedding" ADD CONSTRAINT "Wedding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoAnalysis" ADD CONSTRAINT "PhotoAnalysis_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorPost" ADD CONSTRAINT "CompetitorPost_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_contentIdeaId_fkey" FOREIGN KEY ("contentIdeaId") REFERENCES "ContentIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPostImage" ADD CONSTRAINT "ContentPostImage_contentPostId_fkey" FOREIGN KEY ("contentPostId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPostImage" ADD CONSTRAINT "ContentPostImage_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HashtagSet" ADD CONSTRAINT "HashtagSet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analytics" ADD CONSTRAINT "Analytics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analytics" ADD CONSTRAINT "Analytics_contentPostId_fkey" FOREIGN KEY ("contentPostId") REFERENCES "ContentPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRecommendation" ADD CONSTRAINT "AIRecommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRecommendation" ADD CONSTRAINT "AIRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
