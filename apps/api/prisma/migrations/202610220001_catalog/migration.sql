-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('movies', 'series', 'animation');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('poster', 'still', 'backdrop');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('unreviewed', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "originalName" TEXT,
    "year" INTEGER,
    "category" "Category" NOT NULL,
    "isSeries" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleAlias" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,

    CONSTRAINT "TitleAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalId" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "storageKey" TEXT,
    "kind" "AssetKind" NOT NULL,
    "sourceType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "season" INTEGER,
    "episode" INTEGER,
    "rightsStatus" "ReviewStatus" NOT NULL DEFAULT 'unreviewed',
    "editorialStatus" "ReviewStatus" NOT NULL DEFAULT 'unreviewed',
    "permissionReference" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Title_category_nameRu_idx" ON "Title"("category", "nameRu");

-- CreateIndex
CREATE INDEX "TitleAlias_normalized_idx" ON "TitleAlias"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "TitleAlias_titleId_normalized_key" ON "TitleAlias"("titleId", "normalized");

-- CreateIndex
CREATE INDEX "ExternalId_titleId_idx" ON "ExternalId"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalId_provider_mediaType_value_key" ON "ExternalId"("provider", "mediaType", "value");

-- CreateIndex
CREATE INDEX "Asset_titleId_kind_rightsStatus_editorialStatus_idx" ON "Asset"("titleId", "kind", "rightsStatus", "editorialStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_titleId_provider_sourceUrl_key" ON "Asset"("titleId", "provider", "sourceUrl");

-- AddForeignKey
ALTER TABLE "TitleAlias" ADD CONSTRAINT "TitleAlias_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalId" ADD CONSTRAINT "ExternalId_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;
