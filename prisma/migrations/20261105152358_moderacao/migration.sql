-- AlterTable
ALTER TABLE "ModerationSettings" ALTER COLUMN "enabled" SET DEFAULT false;

-- CreateTable
CREATE TABLE "BlockedDomain" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedDomain" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowedDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowedInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "urlKey" TEXT NOT NULL,
    "sample" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnknownLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "sample" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastMessageId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnknownLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "groupJid" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT '',
    "authorPhone" TEXT NOT NULL DEFAULT '',
    "participant" TEXT NOT NULL DEFAULT '',
    "participantAlt" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "matchedUrl" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "messageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockedDomain_workspaceId_domain_key" ON "BlockedDomain"("workspaceId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "AllowedDomain_workspaceId_domain_key" ON "AllowedDomain"("workspaceId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "AllowedInvite_workspaceId_url_key" ON "AllowedInvite"("workspaceId", "url");

-- CreateIndex
CREATE INDEX "AdminLink_expiresAt_idx" ON "AdminLink"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminLink_workspaceId_urlKey_key" ON "AdminLink"("workspaceId", "urlKey");

-- CreateIndex
CREATE INDEX "UnknownLink_workspaceId_lastSeenAt_idx" ON "UnknownLink"("workspaceId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnknownLink_workspaceId_domain_key" ON "UnknownLink"("workspaceId", "domain");

-- CreateIndex
CREATE INDEX "ModerationEvent_workspaceId_createdAt_idx" ON "ModerationEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationEvent_action_nextAttemptAt_idx" ON "ModerationEvent"("action", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationEvent_workspaceId_groupJid_waMessageId_key" ON "ModerationEvent"("workspaceId", "groupJid", "waMessageId");

-- AddForeignKey
ALTER TABLE "BlockedDomain" ADD CONSTRAINT "BlockedDomain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowedDomain" ADD CONSTRAINT "AllowedDomain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowedInvite" ADD CONSTRAINT "AllowedInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminLink" ADD CONSTRAINT "AdminLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnknownLink" ADD CONSTRAINT "UnknownLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEvent" ADD CONSTRAINT "ModerationEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contas que já tinham configuração (salva pela tela Grupos) começam com a moderação
-- desligada e com convites de grupo bloqueados, como as contas novas.
UPDATE "ModerationSettings" SET "enabled" = false;
INSERT INTO "BlockedDomain" ("id", "workspaceId", "domain", "createdAt")
SELECT 'seed_' || "workspaceId", "workspaceId", 'chat.whatsapp.com', CURRENT_TIMESTAMP
FROM "ModerationSettings"
ON CONFLICT ("workspaceId", "domain") DO NOTHING;
