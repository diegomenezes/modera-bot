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
