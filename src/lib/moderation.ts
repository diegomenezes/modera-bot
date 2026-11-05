import "server-only";
import { prisma } from "./db";
import {
  deleteMessageForEveryone,
  fetchGroupAdminIds,
  phoneForSender,
  senderIsGroupAdmin,
  sendTextMessage,
} from "./evolution";

// Motor de moderação, portado do gerador de reels. Tudo é por conta (workspaceId)
// e usa a instância da Evolution dessa conta.

const DEFAULT_BLOCKED = ["chat.whatsapp.com"];
const ADMIN_LINK_MS = 72 * 60 * 60 * 1000;
const RETRY_DELAYS_MIN = [1, 2, 5, 10, 30, 60, 120, 240];
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const STUCK_PENDING_MS = 3 * 60 * 1000;
const HISTORY_DAYS = 90;

export type IncomingMessage = {
  waMessageId: string;
  remoteJid: string;
  fromMe: boolean;
  participant: string | null;
  participantAlt: string | null;
  pushName: string | null;
  text: string;
  timestamp: Date;
};

type Context = { workspaceId: string; instance: string };

// --- links ---

export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const urls: string[] = [];
  for (const raw of found) {
    try {
      const url = new URL(raw.replace(/[),.;!?]+$/g, ""));
      if (url.protocol === "http:" || url.protocol === "https:") urls.push(url.toString());
    } catch {
      // trecho que não é URL
    }
  }
  return urls;
}

const TRACKING_PARAMS = new Set([
  "tracking_id", "sid", "position", "type", "be_origin", "overlay_label", "search_layout",
  "polycard_client", "matt_tool", "matt_word", "reco_id", "c_id", "c_uid", "attributes",
  "quantity", "pdp_filters", "utm_source", "utm_medium", "utm_campaign", "utm_content",
  "utm_term", "fbclid", "gclid", "spm", "scm",
]);

export function linkKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "chat.whatsapp.com") {
      const code = url.pathname.split("/").filter(Boolean)[0];
      return code ? `chat.whatsapp.com/${code}` : null;
    }
    const path = url.pathname.replace(/\/+$/, "");
    const params = [...url.searchParams.entries()]
      .filter(([name]) => !TRACKING_PARAMS.has(name.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    const search = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}` : "";
    return `${host}${path}${search}`;
  } catch {
    return null;
  }
}

export function hostMatchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const target = domain.toLowerCase().replace(/^\.+/, "").replace(/^www\./, "");
  return host === target || host.endsWith(`.${target}`);
}

const TWO_PART_SUFFIXES = new Set([
  "com.br", "net.br", "org.br", "gov.br", "edu.br", "art.br", "blog.br", "app.br",
  "com.ar", "com.mx", "com.au", "co.uk", "co.jp",
]);

// pt.aliexpress.com -> aliexpress.com, loja.exemplo.com.br -> exemplo.com.br
export function baseDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (/^\d+(\.\d+){3}$/.test(host)) return host;
  const parts = host.split(".");
  const lastTwo = parts.slice(-2).join(".");
  return parts.slice(TWO_PART_SUFFIXES.has(lastTwo) ? -3 : -2).join(".");
}

function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

export function normalizeDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  if (/^https?:\/\//.test(value)) value = hostnameOf(value) ?? "";
  value = value.replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value) && value.length <= 120 ? value : null;
}

// --- webhook ---

const WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
];

// Grupo com mensagens temporárias manda o texto dentro de ephemeralMessage.message.
function unwrapMessage(value: unknown): Record<string, unknown> {
  let message = (value ?? {}) as Record<string, unknown>;
  for (let depth = 0; depth < 3; depth += 1) {
    const wrapper = WRAPPERS.find(
      (name) => (message[name] as { message?: unknown } | undefined)?.message,
    );
    if (!wrapper) break;
    message = (message[wrapper] as { message: Record<string, unknown> }).message;
  }
  return message;
}

function messageText(message: Record<string, unknown>): string {
  const pick = (key: string, field: string) => {
    const value = (message[key] as Record<string, unknown> | undefined)?.[field];
    return typeof value === "string" ? value : "";
  };
  return (
    (typeof message.conversation === "string" ? message.conversation : "") ||
    pick("extendedTextMessage", "text") ||
    pick("imageMessage", "caption") ||
    pick("videoMessage", "caption") ||
    pick("documentMessage", "caption")
  ).trim();
}

export function parseWebhook(body: unknown): IncomingMessage[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const event = String(root.event ?? "").toLowerCase();
  if (!event.includes("messages.upsert") && !event.includes("messages_upsert")) return [];

  const data = root.data ?? root;
  const records: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.messages)
      ? ((data as Record<string, unknown>).messages as unknown[])
      : [data];

  const parsed: IncomingMessage[] = [];
  for (const item of records) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const key = (raw.key ?? {}) as Record<string, unknown>;
    const waMessageId = typeof key.id === "string" ? key.id : null;
    const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : null;
    if (!waMessageId || !remoteJid?.endsWith("@g.us")) continue;

    const text = messageText(unwrapMessage(raw.message));
    if (!text) continue;

    const seconds = Number(raw.messageTimestamp ?? Date.now() / 1000);
    const timestamp = new Date(seconds < 1e12 ? seconds * 1000 : seconds);
    const str = (value: unknown) => (typeof value === "string" && value ? value : null);

    parsed.push({
      waMessageId,
      remoteJid,
      fromMe: key.fromMe === true,
      participant: str(key.participant),
      participantAlt:
        str(key.participantAlt) ?? str(key.participantPn) ?? str(key.senderPn) ??
        str(raw.participantAlt) ?? str(raw.participantPn) ?? str(raw.senderPn),
      pushName: str(raw.pushName),
      text,
      timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    });
  }
  return parsed;
}

// --- configurações ---

export async function ensureSettings(workspaceId: string) {
  const existing = await prisma.moderationSettings.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  // os bloqueados padrão entram uma vez só, quando a conta começa; depois o cliente decide
  const [settings] = await prisma.$transaction([
    prisma.moderationSettings.create({ data: { workspaceId } }),
    prisma.blockedDomain.createMany({
      data: DEFAULT_BLOCKED.map((domain) => ({ workspaceId, domain })),
      skipDuplicates: true,
    }),
  ]);
  return settings;
}

// --- avisos ---

function formatWhen(date: Date): string {
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export async function notifyAlertGroup(
  ctx: Context,
  notifyGroupJid: string,
  lines: string[],
): Promise<string | null> {
  if (!notifyGroupJid) return "Grupo de aviso não escolhido";
  try {
    await sendTextMessage(ctx.instance, notifyGroupJid, lines.join("\n"));
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function announceDeletion(
  ctx: Context,
  announceText: string,
  groupJid: string,
  phone: string | null,
): Promise<string | null> {
  const announcement = announceText.trim();
  if (!announcement) return "Mensagem de moderação vazia.";
  try {
    const mention = phone ? `@${phone}` : "";
    await sendTextMessage(
      ctx.instance,
      groupJid,
      mention ? `${announcement}\n\n${mention}` : announcement,
      { delay: 1500, mentioned: phone ? [phone] : undefined },
    );
    return null;
  } catch (err) {
    return `Não consegui avisar no grupo: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// --- processamento ---

async function rememberAdminLinks(workspaceId: string, urls: string[]) {
  const expiresAt = new Date(Date.now() + ADMIN_LINK_MS);
  for (const sample of urls) {
    const urlKey = linkKey(sample);
    if (!urlKey) continue;
    await prisma.adminLink.upsert({
      where: { workspaceId_urlKey: { workspaceId, urlKey } },
      create: { workspaceId, urlKey, sample, expiresAt },
      update: { sample, expiresAt },
    });
  }
}

// Guarda o domínio estranho. Devolve só os links de domínios novos na lista,
// para o grupo de aviso receber um alerta por domínio.
async function recordUnknownLinks(
  workspaceId: string,
  urls: string[],
  context: { groupName: string; author: string; message: IncomingMessage },
): Promise<string[]> {
  const byDomain = new Map<string, string>();
  for (const sample of urls) {
    const hostname = hostnameOf(sample);
    if (!hostname) continue;
    const domain = baseDomain(hostname);
    if (!byDomain.has(domain)) byDomain.set(domain, sample);
  }

  const fresh: string[] = [];
  for (const [domain, sample] of byDomain) {
    const details = {
      sample,
      groupName: context.groupName,
      author: context.author,
      text: context.message.text,
      lastMessageId: context.message.waMessageId,
      lastSeenAt: context.message.timestamp,
    };
    const where = { workspaceId_domain: { workspaceId, domain } };
    const existing = await prisma.unknownLink.findUnique({ where });
    if (existing) {
      if (existing.lastMessageId !== context.message.waMessageId) {
        await prisma.unknownLink.update({
          where,
          data: { ...details, count: { increment: 1 } },
        });
      }
      continue;
    }
    try {
      await prisma.unknownLink.create({
        data: { workspaceId, domain, ...details, firstSeenAt: context.message.timestamp },
      });
      fresh.push(sample);
    } catch {
      // outra mensagem criou o mesmo domínio ao mesmo tempo
    }
  }
  return fresh;
}

function nextAttemptAfter(attempts: number): Date | null {
  const minutes = RETRY_DELAYS_MIN[attempts - 1];
  return minutes ? new Date(Date.now() + minutes * 60_000) : null;
}

export async function processMessage(ctx: Context, message: IncomingMessage) {
  const { workspaceId } = ctx;
  const group = await prisma.group.findUnique({
    where: { workspaceId_remoteJid: { workspaceId, remoteJid: message.remoteJid } },
  });
  if (!group?.moderated) return { ignored: true as const };

  const urls = extractUrls(message.text);
  if (urls.length === 0) return { ignored: true as const };

  const [workspace, settings] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { active: true } }),
    ensureSettings(workspaceId),
  ]);
  if (!workspace?.active || !settings.enabled) return { ignored: true as const };

  if (message.fromMe) {
    await rememberAdminLinks(workspaceId, urls);
    return { ignored: true as const };
  }
  const adminIds = await fetchGroupAdminIds(ctx.instance, message.remoteJid);
  if (adminIds && senderIsGroupAdmin(adminIds, [message.participant, message.participantAlt])) {
    await rememberAdminLinks(workspaceId, urls);
    return { ignored: true as const };
  }

  await prisma.adminLink.deleteMany({ where: { workspaceId, expiresAt: { lt: new Date() } } });
  const [blocked, allowedDomains, invites, adminLinks] = await Promise.all([
    prisma.blockedDomain.findMany({ where: { workspaceId } }),
    prisma.allowedDomain.findMany({ where: { workspaceId } }),
    prisma.allowedInvite.findMany({ where: { workspaceId } }),
    prisma.adminLink.findMany({ where: { workspaceId, expiresAt: { gt: new Date() } } }),
  ]);

  const allowedKeys = new Set([
    ...adminLinks.map((link) => link.urlKey),
    ...invites.map((invite) => linkKey(invite.url)).filter((key): key is string => !!key),
  ]);

  const matched: string[] = [];
  const unknown: string[] = [];
  for (const sample of urls) {
    const key = linkKey(sample);
    if (key && allowedKeys.has(key)) continue;
    const hostname = hostnameOf(sample);
    if (!hostname) continue;
    if (blocked.some((d) => hostMatchesDomain(hostname, d.domain))) matched.push(sample);
    else if (!allowedDomains.some((d) => hostMatchesDomain(hostname, d.domain))) {
      unknown.push(sample);
    }
  }
  if (matched.length === 0 && unknown.length === 0) return { ignored: true as const };

  const phone = phoneForSender(ctx.instance, message.remoteJid, [
    message.participantAlt,
    message.participant,
  ]);
  const name = message.pushName?.trim() || "";
  const author = name && phone ? `${name} (+${phone})` : name || (phone ? `+${phone}` : "desconhecido");

  const freshUnknown = unknown.length
    ? await recordUnknownLinks(workspaceId, unknown, { groupName: group.name, author, message })
    : [];

  if (matched.length === 0) {
    if (freshUnknown.length === 0) return { ignored: false as const, action: "unknown_seen" };
    const failure = await notifyAlertGroup(ctx, settings.notifyGroupJid, [
      `Link não identificado em ${group.name}`,
      `Quem: ${author}`,
      `Quando: ${formatWhen(message.timestamp)}`,
      `Link: ${freshUnknown.join(", ")}`,
      "",
      message.text,
      "",
      "Nada foi apagado. Libere ou bloqueie o domínio no Modera Bot, em Alertas.",
    ]);
    if (failure) console.error(`[moderacao] ${workspaceId} aviso de link estranho: ${failure}`);
    return { ignored: false as const, action: "unknown" };
  }

  try {
    await prisma.moderationEvent.create({
      data: {
        workspaceId,
        groupJid: group.remoteJid,
        waMessageId: message.waMessageId,
        groupName: group.name,
        author,
        authorName: name,
        authorPhone: phone ?? "",
        participant: message.participant ?? "",
        participantAlt: message.participantAlt ?? "",
        text: message.text,
        matchedUrl: matched.join("\n"),
        action: "pending",
        messageAt: message.timestamp,
      },
    });
  } catch {
    return { ignored: true as const, duplicate: true };
  }

  let action = "notified";
  let detail: string | null = null;
  let deleted = false;
  let attempts = 0;
  let nextAttemptAt: Date | null = null;

  if (settings.deleteMode) {
    attempts = 1;
    try {
      await deleteMessageForEveryone(ctx.instance, {
        id: message.waMessageId,
        remoteJid: message.remoteJid,
        participants: [message.participant, message.participantAlt],
      });
      deleted = true;
      action = "deleted";
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err);
      action = "delete_failed";
      nextAttemptAt = nextAttemptAfter(attempts);
    }
  }

  if (deleted && settings.announceDelete) {
    detail = await announceDeletion(ctx, settings.announceText, group.remoteJid, phone);
  }

  const outcome = !settings.deleteMode
    ? "A mensagem não foi apagada. O modo apagar está desligado."
    : deleted
      ? "A mensagem foi apagada para todos no grupo."
      : `A mensagem não foi apagada. ${detail} Vou tentar de novo sozinho nas próximas horas e aviso aqui.`;

  const notifyFailure = await notifyAlertGroup(ctx, settings.notifyGroupJid, [
    `Link bloqueado em ${group.name}`,
    `Quem: ${author}`,
    `Quando: ${formatWhen(message.timestamp)}`,
    `Link: ${matched.join(", ")}`,
    ...(unknown.length ? [`Link não identificado: ${unknown.join(", ")}`] : []),
    "",
    message.text,
    "",
    outcome,
  ]);
  if (notifyFailure) {
    detail = detail ? `${detail} | ${notifyFailure}` : notifyFailure;
    if (action !== "delete_failed") action = deleted ? "deleted_notify_failed" : "notify_failed";
  }

  await prisma.moderationEvent.update({
    where: {
      workspaceId_groupJid_waMessageId: {
        workspaceId,
        groupJid: group.remoteJid,
        waMessageId: message.waMessageId,
      },
    },
    data: { action, detail, attempts, nextAttemptAt },
  });
  return { ignored: false as const, action };
}

// --- fila de exclusão ---

type StoredEvent = Awaited<ReturnType<typeof prisma.moderationEvent.findFirstOrThrow>>;

async function retryDelete(event: StoredEvent) {
  const [instance, settings, workspace] = await Promise.all([
    prisma.whatsappInstance.findUnique({ where: { workspaceId: event.workspaceId } }),
    prisma.moderationSettings.findUnique({ where: { workspaceId: event.workspaceId } }),
    prisma.workspace.findUnique({ where: { id: event.workspaceId }, select: { active: true } }),
  ]);
  // conta pausada, sem WhatsApp ou com apagar desligado: não insiste
  if (!instance || !settings?.enabled || !settings.deleteMode || !workspace?.active) {
    await prisma.moderationEvent.update({
      where: { id: event.id },
      data: { nextAttemptAt: null },
    });
    return;
  }

  const ctx = { workspaceId: event.workspaceId, instance: instance.name };
  const attempts = event.attempts + 1;
  const lines = [
    `Quem: ${event.author}`,
    `Quando: ${formatWhen(event.messageAt)}`,
    `Link: ${event.matchedUrl.split("\n").join(", ")}`,
  ];

  try {
    await deleteMessageForEveryone(ctx.instance, {
      id: event.waMessageId,
      remoteJid: event.groupJid,
      participants: [event.participant, event.participantAlt],
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const next = nextAttemptAfter(attempts);
    const givingUp = !next || next.getTime() - event.messageAt.getTime() > RETRY_WINDOW_MS;
    await prisma.moderationEvent.update({
      where: { id: event.id },
      data: {
        action: "delete_failed",
        attempts,
        nextAttemptAt: givingUp ? null : next,
        detail: givingUp
          ? `Desisti depois de ${attempts} tentativas. ${reason}`
          : `Tentativa ${attempts} falhou. ${reason}`,
      },
    });
    if (givingUp) {
      await notifyAlertGroup(ctx, settings.notifyGroupJid, [
        `APAGUE À MÃO: link bloqueado em ${event.groupName}`,
        ...lines,
        "",
        event.text,
        "",
        `Tentei apagar ${attempts} vezes e não consegui. ${reason}`,
      ]);
    }
    return;
  }

  let detail = `Apagada na tentativa ${attempts}.`;
  if (settings.announceDelete) {
    const failure = await announceDeletion(
      ctx,
      settings.announceText,
      event.groupJid,
      event.authorPhone || null,
    );
    if (failure) detail = `${detail} ${failure}`;
  }
  await prisma.moderationEvent.update({
    where: { id: event.id },
    data: { action: "deleted", attempts, nextAttemptAt: null, detail },
  });
  await notifyAlertGroup(ctx, settings.notifyGroupJid, [
    `Link apagado depois em ${event.groupName}`,
    ...lines,
    "",
    `Apaguei na tentativa ${attempts}.`,
  ]);
}

// Tenta de novo o que falhou e retoma o que ficou em "Processando" porque o
// processo caiu no meio. Depois de 24 horas desiste e pede para apagar à mão.
export async function retryFailedDeletes() {
  const now = Date.now();
  const events = await prisma.moderationEvent.findMany({
    where: {
      messageAt: { gt: new Date(now - RETRY_WINDOW_MS) },
      OR: [
        { action: "delete_failed", nextAttemptAt: { lte: new Date(now) } },
        { action: "pending", createdAt: { lt: new Date(now - STUCK_PENDING_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  for (const event of events) {
    try {
      await retryDelete(event);
    } catch (err) {
      console.error(`[moderacao] nova tentativa ${event.id}:`, err);
    }
  }
  return events.length;
}

// LGPD: o histórico guarda texto e telefone de quem está nos grupos; não fica para sempre.
export async function pruneHistory() {
  const before = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  await prisma.moderationEvent.deleteMany({ where: { createdAt: { lt: before } } });
  await prisma.unknownLink.deleteMany({ where: { lastSeenAt: { lt: before } } });
  await prisma.adminLink.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export function startModerationWorker() {
  const holder = globalThis as { __moderaWorker?: ReturnType<typeof setInterval> };
  if (holder.__moderaWorker) return;
  let running = false;
  let ticks = 0;
  holder.__moderaWorker = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await retryFailedDeletes();
      // uma vez por hora
      if (ticks % 60 === 0) await pruneHistory();
      ticks += 1;
    } catch (err) {
      console.error("[moderacao] fila de exclusão:", err);
    } finally {
      running = false;
    }
  }, 60_000);
}

// --- ranking ---

export type SenderRank = { name: string; phone: string | null; count: number };

export function senderRanks(
  events: Array<{ author: string; authorName: string; authorPhone: string }>,
): SenderRank[] {
  const grouped = new Map<string, SenderRank>();
  for (const event of events) {
    const phone = event.authorPhone.trim() || null;
    const name =
      event.authorName.trim() || event.author.replace(/\s*\([^)]*\)\s*$/, "").trim() || "Sem nome";
    const key = phone || `nome:${name.toLowerCase()}`;
    const current = grouped.get(key);
    if (current) current.count += 1;
    else grouped.set(key, { name, phone, count: 1 });
  }
  return [...grouped.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"),
  );
}
