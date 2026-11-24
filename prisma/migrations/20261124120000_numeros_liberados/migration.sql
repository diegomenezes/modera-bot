-- CreateTable
CREATE TABLE "AllowedSender" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "lid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowedSender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AllowedSender_workspaceId_phone_key" ON "AllowedSender"("workspaceId", "phone");

-- AddForeignKey
ALTER TABLE "AllowedSender" ADD CONSTRAINT "AllowedSender_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
