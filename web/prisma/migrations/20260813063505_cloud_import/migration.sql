-- CreateEnum
CREATE TYPE "CloudProvider" AS ENUM ('GOOGLE_DRIVE', 'DROPBOX');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('DEVICE', 'GOOGLE_DRIVE', 'DROPBOX');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'IMPORTING', 'ANALYZING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "importJobId" TEXT,
ADD COLUMN     "importSource" "ImportSource";

-- CreateTable
CREATE TABLE "CloudConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "CloudProvider" NOT NULL,
    "accountLabel" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoImportJob" (
    "id" TEXT NOT NULL,
    "weddingId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "sourceLabel" TEXT,
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "importedFiles" INTEGER NOT NULL DEFAULT 0,
    "analyzedFiles" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CloudConnection_organizationId_provider_key" ON "CloudConnection"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "PhotoImportJob_weddingId_idx" ON "PhotoImportJob"("weddingId");

-- CreateIndex
CREATE INDEX "Photo_importJobId_idx" ON "Photo"("importJobId");

-- AddForeignKey
ALTER TABLE "CloudConnection" ADD CONSTRAINT "CloudConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoImportJob" ADD CONSTRAINT "PhotoImportJob_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "PhotoImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
