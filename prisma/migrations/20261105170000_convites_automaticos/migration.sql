-- AlterTable
ALTER TABLE "AllowedInvite" ADD COLUMN     "groupJid" TEXT,
ADD COLUMN     "groupName" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "AllowedInvite_workspaceId_groupJid_key" ON "AllowedInvite"("workspaceId", "groupJid");

