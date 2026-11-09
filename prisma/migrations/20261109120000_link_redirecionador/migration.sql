-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "redirectClicks" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "redirectSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_redirectSlug_key" ON "Workspace"("redirectSlug");

