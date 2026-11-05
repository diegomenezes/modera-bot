"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/actions";
import { requireWorkspace } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { deleteOwnMessage, sendTextMessage } from "@/lib/evolution";
import { syncInviteLinks } from "@/lib/whatsapp";
import {
  ensureSettings,
  hostMatchesDomain,
  linkKey,
  normalizeDomain,
  notifyAlertGroup,
} from "@/lib/moderation";

function done(message?: string): FormState {
  revalidatePath("/regras");
  revalidatePath("/alertas");
  revalidatePath("/");
  return message ? { ok: message } : undefined;
}

export async function saveSettings(_prev: FormState, form: FormData): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  await ensureSettings(workspace.id);
  const announceText = String(form.get("announceText") ?? "").trim().slice(0, 1000);
  const announceDelete = form.get("announceDelete") === "on";
  if (announceDelete && !announceText) {
    return { error: "Escreva a mensagem que sai no grupo depois de apagar." };
  }
  await prisma.moderationSettings.update({
    where: { workspaceId: workspace.id },
    data: {
      enabled: form.get("enabled") === "on",
      deleteMode: form.get("deleteMode") === "on",
      announceDelete,
      announceText,
    },
  });
  return done("Configuração salva.");
}

export async function sendTestAlert(): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  const [instance, settings] = await Promise.all([
    prisma.whatsappInstance.findUnique({ where: { workspaceId: workspace.id } }),
    ensureSettings(workspace.id),
  ]);
  if (instance?.status !== "open") return { error: "Conecte o WhatsApp primeiro." };
  if (!settings.notifyGroupJid) return { error: "Escolha o grupo de aviso na tela Grupos." };
  const failure = await notifyAlertGroup(
    { workspaceId: workspace.id, instance: instance.name },
    settings.notifyGroupJid,
    ["Teste do Modera Bot", "", "Se esta mensagem chegou, os avisos vão chegar aqui."],
  );
  return failure ? { error: failure } : { ok: "Mensagem de teste enviada para o grupo de aviso." };
}

// Manda uma frase no grupo de aviso, apaga para todos e manda a mensagem pós-exclusão.
// Confirma que o número do bot consegue apagar e avisar.
export async function testDelete(): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  const [instance, settings] = await Promise.all([
    prisma.whatsappInstance.findUnique({ where: { workspaceId: workspace.id } }),
    ensureSettings(workspace.id),
  ]);
  if (instance?.status !== "open") return { error: "Conecte o WhatsApp primeiro." };
  if (!settings.notifyGroupJid) return { error: "Escolha o grupo de aviso na tela Grupos." };
  try {
    const sent = await sendTextMessage(
      instance.name,
      settings.notifyGroupJid,
      "Teste de apagar\n\nEsta mensagem deve sumir do grupo em seguida.",
    );
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await deleteOwnMessage(instance.name, sent);
    if (settings.announceText.trim()) {
      await sendTextMessage(instance.name, settings.notifyGroupJid, settings.announceText, {
        delay: 1500,
      });
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  return {
    ok: "A frase de teste foi apagada e a mensagem pós-exclusão foi enviada. Confira no grupo de aviso.",
  };
}

export async function addBlocked(_prev: FormState, form: FormData): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (!domain) return { error: "Domínio inválido. Exemplo: shopee.com.br" };
  await ensureSettings(workspace.id);
  await prisma.$transaction([
    prisma.blockedDomain.upsert({
      where: { workspaceId_domain: { workspaceId: workspace.id, domain } },
      create: { workspaceId: workspace.id, domain },
      update: {},
    }),
    prisma.allowedDomain.deleteMany({ where: { workspaceId: workspace.id, domain } }),
    prisma.unknownLink.deleteMany({ where: { workspaceId: workspace.id, domain } }),
  ]);
  return done(`${domain} adicionado aos bloqueados.`);
}

export async function addAllowed(_prev: FormState, form: FormData): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (!domain) return { error: "Domínio inválido. Exemplo: youtube.com" };
  const blocked = await prisma.blockedDomain.findMany({ where: { workspaceId: workspace.id } });
  const conflict = blocked.find((item) => hostMatchesDomain(domain, item.domain));
  if (conflict) {
    return { error: `${domain} está nos bloqueados (${conflict.domain}). Remova de lá antes.` };
  }
  await prisma.$transaction([
    prisma.allowedDomain.upsert({
      where: { workspaceId_domain: { workspaceId: workspace.id, domain } },
      create: { workspaceId: workspace.id, domain },
      update: {},
    }),
    prisma.unknownLink.deleteMany({ where: { workspaceId: workspace.id, domain } }),
  ]);
  return done(`${domain} adicionado aos liberados.`);
}

export async function addInvite(_prev: FormState, form: FormData): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  const key = linkKey(String(form.get("url") ?? "").trim());
  if (!key?.startsWith("chat.whatsapp.com/")) {
    return { error: "Cole um link de convite, que começa com https://chat.whatsapp.com/" };
  }
  const url = `https://${key}`;
  await prisma.allowedInvite.upsert({
    where: { workspaceId_url: { workspaceId: workspace.id, url } },
    create: { workspaceId: workspace.id, url },
    update: {},
  });
  return done("Convite autorizado.");
}

export async function refreshInvites(): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  const result = await syncInviteLinks(workspace.id);
  done();
  if (result.total === 0) {
    return { error: "Nenhum grupo moderado em que o bot é admin." };
  }
  return result.failed
    ? { error: `Atualizei ${result.total - result.failed} de ${result.total}. Nos outros o WhatsApp não devolveu o link.` }
    : { ok: `Convites dos ${result.total} grupos moderados atualizados.` };
}

export async function removeRule(kind: "blocked" | "allowed" | "invite", id: string) {
  const { workspace } = await requireWorkspace();
  // o filtro por workspaceId impede apagar item de outra conta
  const where = { id, workspaceId: workspace.id };
  if (kind === "blocked") await prisma.blockedDomain.deleteMany({ where });
  if (kind === "allowed") await prisma.allowedDomain.deleteMany({ where });
  // convite automático volta sozinho; só o adicionado à mão pode ser removido
  if (kind === "invite") await prisma.allowedInvite.deleteMany({ where: { ...where, groupJid: null } });
  done();
}
