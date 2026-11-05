"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/dal";
import { prisma } from "@/lib/db";

function refresh() {
  revalidatePath("/alertas");
  revalidatePath("/regras");
}

export async function decideUnknown(id: string, decision: "allow" | "block" | "dismiss") {
  const { workspace } = await requireWorkspace();
  const workspaceId = workspace.id;
  const link = await prisma.unknownLink.findFirst({ where: { id, workspaceId } });
  if (!link) return;
  const { domain } = link;
  const key = { workspaceId_domain: { workspaceId, domain } };

  if (decision === "allow") {
    await prisma.$transaction([
      prisma.blockedDomain.deleteMany({ where: { workspaceId, domain } }),
      prisma.allowedDomain.upsert({ where: key, create: { workspaceId, domain }, update: {} }),
    ]);
  } else if (decision === "block") {
    await prisma.$transaction([
      prisma.allowedDomain.deleteMany({ where: { workspaceId, domain } }),
      prisma.blockedDomain.upsert({ where: key, create: { workspaceId, domain }, update: {} }),
    ]);
  }
  await prisma.unknownLink.deleteMany({ where: { id, workspaceId } });
  refresh();
}

export async function deleteEvent(id: string) {
  const { workspace } = await requireWorkspace();
  await prisma.moderationEvent.deleteMany({ where: { id, workspaceId: workspace.id } });
  refresh();
}

export async function clearEvents() {
  const { workspace } = await requireWorkspace();
  await prisma.moderationEvent.deleteMany({ where: { workspaceId: workspace.id } });
  refresh();
}
