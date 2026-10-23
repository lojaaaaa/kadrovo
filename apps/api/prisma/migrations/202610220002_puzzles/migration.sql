CREATE TYPE "PuzzleMode" AS ENUM ('frames', 'spotlight');
CREATE TABLE "Puzzle" (
 "id" TEXT NOT NULL,
 "titleId" TEXT NOT NULL,
 "mode" "PuzzleMode" NOT NULL,
 "stageFiles" TEXT[],
 "sourceAssetIds" TEXT[],
 "crops" JSONB,
 "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Puzzle_titleId_mode_key" ON "Puzzle"("titleId", "mode");
ALTER TABLE "Puzzle" ADD CONSTRAINT "Puzzle_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;
