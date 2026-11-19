"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/actions";
import { requireWorkspace } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { ensureSettings } from "@/lib/moderation";
import { createNextGroup, draftNextGroup, type NewGroupDraft } from "@/lib/groupCreate";
import { syncGroups, syncInviteLinks } from "@/lib/whatsapp";

export async function refreshGroups(): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  try {
    const count = await syncGroups(workspace.id);
    await syncInviteLinks(workspace.id).catch(() => null);
    revalidatePath("/grupos");
    return { ok: `${count} grupo(s) encontrados.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function saveGroups(_prev: FormState, form: FormData): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  const own = await prisma.group.findMany({
    where: { workspaceId: workspace.id },
    select: { remoteJid: true },
  });
  const valid = new Set(own.map((g) => g.remoteJid));

  // só aceita grupos desta conta, nunca um ID vindo de fora
  const moderated = form.getAll("moderated").map(String).filter((jid) => valid.has(jid));
  const notify = String(form.get("notify") ?? "");
  const notifyGroupJid = valid.has(notify) ? notify : "";

  if (moderated.includes(notifyGroupJid) && notifyGroupJid) {
    return { error: "O grupo de aviso não pode ser um dos grupos moderados." };
  }

  await ensureSettings(workspace.id);
  await prisma.$transaction([
    prisma.group.updateMany({
      where: { workspaceId: workspace.id },
      data: { moderated: false },
    }),
    prisma.group.updateMany({
      where: { workspaceId: workspace.id, remoteJid: { in: moderated } },
      data: { moderated: true },
    }),
    prisma.moderationSettings.update({
      where: { workspaceId: workspace.id },
      data: { notifyGroupJid },
    }),
  ]);

  // convites dos grupos moderados entram nos autorizados na hora
  await syncInviteLinks(workspace.id).catch(() => null);
  revalidatePath("/grupos");
  revalidatePath("/regras");
  revalidatePath("/");
  return { ok: `Salvo: ${moderated.length} grupo(s) moderado(s).` };
}

export async function loadGroupDraft(
  sourceJid: string,
): Promise<{ draft?: NewGroupDraft; error?: string }> {
  const { workspace } = await requireWorkspace();
  try {
    return { draft: await draftNextGroup(workspace.id, sourceJid) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export type CreateGroupState =
  | { error?: string; ok?: string; done?: string[]; failed?: string[] }
  | undefined;

export async function createGroupAction(
  _prev: CreateGroupState,
  form: FormData,
): Promise<CreateGroupState> {
  const { workspace } = await requireWorkspace();
  const picture = String(form.get("picture") ?? "").replace(/^data:image\/\w+;base64,/, "");
  try {
    const result = await createNextGroup(workspace.id, {
      sourceJid: String(form.get("source") ?? ""),
      description: String(form.get("description") ?? "").slice(0, 2048),
      admins: String(form.get("admins") ?? "").split(/[\n,;]+/).map((v) => v.trim()).filter(Boolean),
      pictureBase64: picture || null,
    });
    revalidatePath("/grupos");
    revalidatePath("/");
    return { ok: `${result.name} pronto.`, done: result.done, failed: result.failed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
