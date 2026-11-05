import "server-only";

// Cliente da Evolution API. Cada conta tem a própria instância; toda função recebe o nome dela.

function config() {
  const baseUrl = process.env.EVOLUTION_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Configure EVOLUTION_BASE_URL e EVOLUTION_API_KEY");
  }
  return { baseUrl, apiKey };
}

async function call(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const { baseUrl, apiKey } = config();
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.timeoutMs ?? 20000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

function fail(action: string, text: string): never {
  throw new Error(`${action}: ${text.slice(0, 300)}`);
}

export const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"];

export type QrResult = { qr: string | null; pairingCode: string | null };

function readQr(payload: unknown): QrResult {
  const root = (payload ?? {}) as Record<string, unknown>;
  const qrcode = (root.qrcode ?? root) as Record<string, unknown>;
  return {
    qr: typeof qrcode.base64 === "string" ? qrcode.base64 : null,
    pairingCode: typeof qrcode.pairingCode === "string" ? qrcode.pairingCode : null,
  };
}

export async function createInstance(input: {
  name: string;
  webhookUrl: string;
  number?: string;
}): Promise<QrResult> {
  const res = await call("/instance/create", {
    method: "POST",
    body: {
      instanceName: input.name,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      ...(input.number ? { number: input.number } : {}),
      groupsIgnore: false,
      rejectCall: false,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
      webhook: {
        url: input.webhookUrl,
        byEvents: false,
        base64: false,
        events: WEBHOOK_EVENTS,
      },
    },
  });
  if (!res.ok) fail("Não consegui criar a conexão", res.text);
  return readQr(res.json);
}

export async function connectInstance(name: string, number?: string): Promise<QrResult> {
  const query = number ? `?number=${encodeURIComponent(number)}` : "";
  const res = await call(`/instance/connect/${encodeURIComponent(name)}${query}`);
  if (!res.ok) fail("Não consegui gerar o QR code", res.text);
  return readQr(res.json);
}

export async function instanceExists(name: string): Promise<boolean> {
  const res = await call(`/instance/connectionState/${encodeURIComponent(name)}`);
  return res.ok;
}

export async function connectionState(name: string): Promise<string> {
  const res = await call(`/instance/connectionState/${encodeURIComponent(name)}`, {
    timeoutMs: 8000,
  });
  if (res.status === 404) return "missing";
  if (!res.ok) return "unknown";
  const state = (res.json as { instance?: { state?: string } })?.instance?.state;
  return state ?? "unknown";
}

export async function instanceOwner(
  name: string,
): Promise<{ phone: string | null; profileName: string | null }> {
  const res = await call(`/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`);
  const list = Array.isArray(res.json) ? res.json : [res.json];
  const item = (list[0] ?? {}) as Record<string, unknown>;
  const ownerJid = typeof item.ownerJid === "string" ? item.ownerJid : "";
  return {
    phone: phoneDigits(ownerJid),
    profileName: typeof item.profileName === "string" ? item.profileName : null,
  };
}

export async function logoutInstance(name: string): Promise<void> {
  await call(`/instance/logout/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function deleteInstance(name: string): Promise<void> {
  const res = await call(`/instance/delete/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) fail("Não consegui apagar a conexão", res.text);
}

export async function setWebhook(name: string, url: string): Promise<void> {
  const res = await call(`/webhook/set/${encodeURIComponent(name)}`, {
    method: "POST",
    body: {
      webhook: {
        enabled: true,
        url,
        webhookByEvents: false,
        webhookBase64: false,
        events: WEBHOOK_EVENTS,
      },
    },
  });
  if (!res.ok) fail("Não consegui ligar o webhook", res.text);
}

export function phoneDigits(value: unknown): string | null {
  if (typeof value !== "string" || value.toLowerCase().endsWith("@lid")) return null;
  const digits = (value.split("@")[0]?.split(":")[0] ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export type GroupInfo = {
  remoteJid: string;
  name: string;
  size: number;
  botIsAdmin: boolean;
};

export async function fetchGroups(name: string, botPhone: string | null): Promise<GroupInfo[]> {
  const res = await call(
    `/group/fetchAllGroups/${encodeURIComponent(name)}?getParticipants=true`,
    { timeoutMs: 60000 },
  );
  if (!res.ok || !Array.isArray(res.json)) fail("Não consegui ler os grupos", res.text);

  return (res.json as Record<string, unknown>[])
    .filter((g) => typeof g.id === "string" && g.id.endsWith("@g.us"))
    .map((g) => {
      const participants = Array.isArray(g.participants)
        ? (g.participants as Record<string, unknown>[])
        : [];
      const me = botPhone
        ? participants.find((p) =>
            [p.id, p.phoneNumber, p.jid].some((v) => phoneDigits(v) === botPhone),
          )
        : undefined;
      return {
        remoteJid: g.id as string,
        name: typeof g.subject === "string" && g.subject.trim() ? g.subject : "Sem nome",
        size: typeof g.size === "number" ? g.size : participants.length,
        botIsAdmin: me?.admin === "admin" || me?.admin === "superadmin",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// --- Moderação (portado do gerador de reels, por instância) ---

function canonicalJid(value: string): string {
  return value.trim().toLowerCase().replace(/:\d+(?=@)/, "");
}

type AdminCacheEntry = { until: number; ids: Set<string> | null; phones: Map<string, string> };
const adminCache = new Map<string, AdminCacheEntry>();

function readParticipants(payload: unknown): Record<string, unknown>[] {
  const root = (payload ?? {}) as Record<string, unknown>;
  const list =
    root.participants ?? (root.data as Record<string, unknown> | undefined)?.participants;
  return Array.isArray(list)
    ? (list.filter((item) => item && typeof item === "object") as Record<string, unknown>[])
    : [];
}

export async function fetchGroupAdminIds(
  instance: string,
  remoteJid: string,
): Promise<Set<string> | null> {
  const cacheKey = `${instance}|${remoteJid}`;
  const cached = adminCache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.ids;

  try {
    const res = await call(
      `/group/findGroupInfos/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(remoteJid)}`,
      { timeoutMs: 15000 },
    );
    if (!res.ok) throw new Error(res.text);

    const ids = new Set<string>();
    const phones = new Map<string, string>();
    for (const participant of readParticipants(res.json)) {
      const phone =
        phoneDigits(participant.phoneNumber) ||
        phoneDigits(participant.jid) ||
        phoneDigits(participant.id);
      const keys = [participant.id, participant.lid, participant.phoneNumber, participant.jid]
        .filter((key): key is string => typeof key === "string" && key.includes("@"))
        .map(canonicalJid);
      if (phone) for (const key of keys) phones.set(key, phone);
      const role = participant.admin;
      if (role === "admin" || role === "superadmin" || role === true) {
        for (const key of keys) ids.add(key);
      }
    }
    adminCache.set(cacheKey, { until: Date.now() + 10 * 60_000, ids, phones });
    return ids;
  } catch {
    adminCache.set(cacheKey, { until: Date.now() + 60_000, ids: null, phones: new Map() });
    return null;
  }
}

export function phoneForSender(
  instance: string,
  remoteJid: string,
  candidates: Array<string | null | undefined>,
): string | null {
  for (const value of candidates) {
    const direct = phoneDigits(value);
    if (direct) return direct;
  }
  const phones = adminCache.get(`${instance}|${remoteJid}`)?.phones;
  if (!phones) return null;
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const found = phones.get(canonicalJid(value));
    if (found) return found;
  }
  return null;
}

export function senderIsGroupAdmin(
  adminIds: Set<string>,
  candidates: Array<string | null | undefined>,
): boolean {
  return candidates.some(
    (value) => typeof value === "string" && adminIds.has(canonicalJid(value)),
  );
}

export async function sendTextMessage(
  instance: string,
  number: string,
  text: string,
  options?: { delay?: number; mentioned?: string[] },
): Promise<{ id: string; remoteJid: string }> {
  const res = await call(`/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: {
      number,
      text,
      linkPreview: false,
      ...(options?.delay ? { delay: options.delay } : {}),
      ...(options?.mentioned?.length ? { mentioned: options.mentioned } : {}),
    },
  });
  if (!res.ok) throw new Error(`Falha ao enviar no WhatsApp: ${res.text.slice(0, 300)}`);
  const key = ((res.json as Record<string, unknown> | null)?.key ?? {}) as Record<string, unknown>;
  if (typeof key.id !== "string" || !key.id) {
    throw new Error("A Evolution respondeu, mas não confirmou o envio.");
  }
  return { id: key.id, remoteJid: typeof key.remoteJid === "string" ? key.remoteJid : number };
}

// Apaga para todos uma mensagem que o próprio bot mandou (usado no "Testar apagar").
export async function deleteOwnMessage(
  instance: string,
  input: { id: string; remoteJid: string },
): Promise<void> {
  const res = await call(`/chat/deleteMessageForEveryone/${encodeURIComponent(instance)}`, {
    method: "DELETE",
    body: { id: input.id, remoteJid: input.remoteJid, fromMe: true },
  });
  if (!res.ok) throw new Error(`Falha ao apagar: ${res.text.slice(0, 300)}`);
  const protocol = (
    res.json as { message?: { protocolMessage?: { type?: string | number; key?: { id?: string } } } } | null
  )?.message?.protocolMessage;
  const isRevoke = protocol?.type === "REVOKE" || protocol?.type === 0 || protocol?.type === "0";
  if (!isRevoke || protocol?.key?.id !== input.id) {
    throw new Error("A Evolution respondeu, mas o pedido não foi de apagar para todos.");
  }
}

function revokeNamesAuthor(body: unknown, messageId: string): boolean {
  const protocol = (
    body as {
      message?: {
        protocolMessage?: {
          type?: string | number;
          key?: { id?: string; participant?: string };
        };
      };
    } | null
  )?.message?.protocolMessage;
  if (!protocol?.key) return false;
  const isRevoke = protocol.type === "REVOKE" || protocol.type === 0 || protocol.type === "0";
  if (!isRevoke) return false;
  if (protocol.key.id && protocol.key.id !== messageId) return false;
  return typeof protocol.key.participant === "string" && protocol.key.participant.includes("@");
}

async function requestDelete(
  instance: string,
  input: { id: string; remoteJid: string },
  participant: string,
): Promise<string | null> {
  try {
    const res = await call(`/chat/deleteMessageForEveryone/${encodeURIComponent(instance)}`, {
      method: "DELETE",
      body: { id: input.id, remoteJid: input.remoteJid, fromMe: false, participant },
    });
    if (!res.ok) return `Falha ao apagar mensagem: ${res.text.slice(0, 300)}`;
    if (!revokeNamesAuthor(res.json, input.id)) {
      return "A Evolution respondeu, mas o pedido não identificou o autor. Sem isso o WhatsApp não apaga para todos.";
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const RESTART_COOLDOWN_MS = 5 * 60_000;
const lastRestartAt = new Map<string, number>();

// A sessão às vezes aparece aberta com o socket do WhatsApp caído ("Connection Closed").
// Reiniciar a instância reconecta sem pedir QR.
async function restartAfterConnectionClosed(instance: string): Promise<boolean> {
  if (Date.now() - (lastRestartAt.get(instance) ?? 0) < RESTART_COOLDOWN_MS) return false;
  lastRestartAt.set(instance, Date.now());
  try {
    const res = await call(`/instance/restart/${encodeURIComponent(instance)}`, {
      method: "POST",
      timeoutMs: 15000,
    });
    if (!res.ok) {
      console.error(`[moderacao] reiniciar ${instance}: ${res.text.slice(0, 300)}`);
      return false;
    }
  } catch (err) {
    console.error(`[moderacao] reiniciar ${instance}:`, err);
    return false;
  }
  console.log(`[moderacao] conexão de ${instance} caiu, reiniciei a instância.`);
  for (let wait = 0; wait < 10; wait += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if ((await connectionState(instance)) === "open") return true;
  }
  return false;
}

export async function deleteMessageForEveryone(
  instance: string,
  input: { id: string; remoteJid: string; participants: Array<string | null | undefined> },
): Promise<void> {
  const candidates = [
    ...new Set(
      input.participants.filter(
        (value): value is string => typeof value === "string" && value.includes("@"),
      ),
    ),
  ];
  if (candidates.length === 0) {
    throw new Error("A mensagem chegou sem o autor do grupo, então não dá para apagar para todos.");
  }

  const attempts = 4;
  let lastError = "Falha ao apagar a mensagem para todos.";
  let accepted = false;

  // manda o pedido mais de uma vez: o WhatsApp às vezes ignora um pedido aceito
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const shift = attempt % candidates.length;
    const ordered = [...candidates.slice(shift), ...candidates.slice(0, shift)];
    let attemptError: string | null = null;
    for (const participant of ordered) {
      attemptError = await requestDelete(instance, input, participant);
      if (!attemptError) break;
    }
    if (!attemptError) {
      accepted = true;
    } else {
      lastError = attemptError;
      console.error(
        `[moderacao] apagar ${input.id} tentativa ${attempt + 1}/${attempts}: ${attemptError}`,
      );
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  if (!accepted && /connection closed/i.test(lastError)) {
    if (await restartAfterConnectionClosed(instance)) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      for (const participant of candidates) {
        const attemptError = await requestDelete(instance, input, participant);
        if (!attemptError) {
          accepted = true;
          break;
        }
        lastError = attemptError;
      }
    }
  }

  if (!accepted) throw new Error(lastError);
}
