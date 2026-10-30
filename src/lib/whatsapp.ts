import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import {
  connectInstance,
  connectionState,
  createInstance,
  deleteInstance,
  fetchGroups,
  instanceExists,
  instanceOwner,
  logoutInstance,
  setWebhook,
  type QrResult,
} from "./evolution";

// Tudo aqui recebe o workspaceId já validado pelo dal.ts.

function publicUrl() {
  const base = (process.env.APP_URL || process.env.BETTER_AUTH_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("Configure APP_URL com o endereço público do sistema");
  return base;
}

export function webhookUrl(token: string) {
  return `${publicUrl()}/api/webhook/${token}`;
}

export async function getInstance(workspaceId: string) {
  return prisma.whatsappInstance.findUnique({ where: { workspaceId } });
}

async function ensureInstance(workspaceId: string) {
  const existing = await getInstance(workspaceId);
  if (existing) return existing;
  return prisma.whatsappInstance.create({
    data: {
      workspaceId,
      name: `mb-${randomBytes(6).toString("hex")}`,
      webhookToken: randomBytes(24).toString("hex"),
    },
  });
}

export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  // número brasileiro digitado sem o 55
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? digits : null;
}

// Gera o QR code, ou o código de pareamento quando vem o telefone.
export async function startConnection(
  workspaceId: string,
  phone?: string,
): Promise<QrResult> {
  const instance = await ensureInstance(workspaceId);
  const url = webhookUrl(instance.webhookToken);
  const exists = await instanceExists(instance.name);

  let result: QrResult;
  if (phone) {
    // a Evolution só devolve o código de pareamento quando a instância nasce com o número
    if (exists) await deleteInstance(instance.name);
    result = await createInstance({ name: instance.name, webhookUrl: url, number: phone });
    if (!result.pairingCode) result = await connectInstance(instance.name, phone);
  } else if (exists) {
    result = await connectInstance(instance.name);
  } else {
    result = await createInstance({ name: instance.name, webhookUrl: url });
  }

  await prisma.whatsappInstance.update({
    where: { id: instance.id },
    data: { status: "connecting" },
  });
  return result;
}

export type ConnectionStatus = {
  status: "none" | "disconnected" | "connecting" | "open";
  phone: string | null;
  profileName: string | null;
};

export async function refreshStatus(workspaceId: string): Promise<ConnectionStatus> {
  const instance = await getInstance(workspaceId);
  if (!instance) return { status: "none", phone: null, profileName: null };

  const state = await connectionState(instance.name);
  if (state === "unknown") {
    return {
      status: instance.status as ConnectionStatus["status"],
      phone: instance.phone,
      profileName: instance.profileName,
    };
  }

  const status: ConnectionStatus["status"] =
    state === "open" ? "open" : state === "connecting" ? "connecting" : "disconnected";

  let { phone, profileName } = instance;
  if (status === "open" && (instance.status !== "open" || !phone)) {
    const owner = await instanceOwner(instance.name);
    phone = owner.phone;
    profileName = owner.profileName;
    // garante o webhook certo mesmo se a instância foi criada antes de mudar o endereço
    await setWebhook(instance.name, webhookUrl(instance.webhookToken)).catch(() => {});
  }

  if (status !== instance.status || phone !== instance.phone) {
    await prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: {
        status,
        phone,
        profileName,
        ...(status === "open" && instance.status !== "open"
          ? { connectedAt: new Date() }
          : {}),
      },
    });
  }
  return { status, phone, profileName };
}

export async function disconnect(workspaceId: string) {
  const instance = await getInstance(workspaceId);
  if (!instance) return;
  await logoutInstance(instance.name);
  await prisma.whatsappInstance.update({
    where: { id: instance.id },
    data: { status: "disconnected" },
  });
}

export async function syncGroups(workspaceId: string) {
  const instance = await getInstance(workspaceId);
  if (!instance || instance.status !== "open") {
    throw new Error("Conecte o WhatsApp antes de buscar os grupos.");
  }
  const groups = await fetchGroups(instance.name, instance.phone);
  const now = new Date();

  await prisma.$transaction([
    ...groups.map((group) =>
      prisma.group.upsert({
        where: { workspaceId_remoteJid: { workspaceId, remoteJid: group.remoteJid } },
        create: { workspaceId, ...group, syncedAt: now },
        update: { name: group.name, size: group.size, botIsAdmin: group.botIsAdmin, syncedAt: now },
      }),
    ),
    // grupos de que o número saiu
    prisma.group.deleteMany({
      where: { workspaceId, remoteJid: { notIn: groups.map((g) => g.remoteJid) } },
    }),
  ]);
  return groups.length;
}
