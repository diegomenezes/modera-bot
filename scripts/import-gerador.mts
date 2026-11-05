// Traz a moderação do gerador de reels para uma conta do Modera Bot.
// Uso: npm run import:gerador -- <email do cliente> <caminho do banco do gerador>
// Ex.: npm run import:gerador -- diego+bot@exemplo.com /opt/gerador-reels/data/prod.db
//
// Antes: conectar o WhatsApp da conta e clicar em "Buscar meus grupos".
// Pode rodar mais de uma vez: não duplica nada. A moderação continua desligada.
import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { prisma } from "../src/lib/db";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const date = (v: unknown) => new Date(typeof v === "number" ? v : Number(v) || String(v));

const [email, dbPath] = process.argv.slice(2);
if (!email || !dbPath) {
  console.error("Uso: npm run import:gerador -- <email do cliente> <caminho do banco do gerador>");
  process.exit(1);
}

const membership = await prisma.membership.findFirst({
  where: { user: { email: email.toLowerCase() } },
  include: { workspace: true },
});
if (!membership) {
  console.error(`Nenhuma conta de cliente para ${email}.`);
  process.exit(1);
}
const workspaceId = membership.workspace.id;
const db = new DatabaseSync(dbPath, { readOnly: true });
const all = (sql: string) => db.prepare(sql).all() as Row[];

let groups = await prisma.group.findMany({ where: { workspaceId } });
if (groups.length === 0) {
  // mesma busca do botão "Buscar meus grupos" (só leitura na Evolution)
  const instance = await prisma.whatsappInstance.findUnique({ where: { workspaceId } });
  if (instance?.status !== "open") {
    console.error("Conecte o WhatsApp da conta antes de importar.");
    process.exit(1);
  }
  const base = process.env.EVOLUTION_BASE_URL!.replace(/\/$/, "");
  const res = await fetch(
    `${base}/group/fetchAllGroups/${encodeURIComponent(instance.name)}?getParticipants=true`,
    { headers: { apikey: process.env.EVOLUTION_API_KEY! }, signal: AbortSignal.timeout(60000) },
  );
  const list = (await res.json()) as Row[];
  if (!res.ok || !Array.isArray(list)) {
    console.error(`Não consegui ler os grupos: ${JSON.stringify(list).slice(0, 200)}`);
    process.exit(1);
  }
  const digits = (v: unknown) => str(v).split("@")[0].split(":")[0].replace(/\D/g, "");
  await prisma.group.createMany({
    data: list
      .filter((g) => str(g.id).endsWith("@g.us"))
      .map((g) => {
        const participants = (Array.isArray(g.participants) ? g.participants : []) as Row[];
        const me = participants.find((p) =>
          [p.id, p.phoneNumber, p.jid].some((v) => !str(v).endsWith("@lid") && digits(v) === instance.phone),
        );
        return {
          workspaceId,
          remoteJid: str(g.id),
          name: str(g.subject) || "Sem nome",
          size: typeof g.size === "number" ? g.size : participants.length,
          botIsAdmin: me?.admin === "admin" || me?.admin === "superadmin",
        };
      }),
    skipDuplicates: true,
  });
  groups = await prisma.group.findMany({ where: { workspaceId } });
  console.log(`Grupos buscados no WhatsApp: ${groups.length}`);
}
const known = new Set(groups.map((g) => g.remoteJid));

// configurações (a moderação fica desligada: quem liga é você, na tela Regras)
const old = (all('SELECT * FROM "ModerationSettings" LIMIT 1')[0] ?? {}) as Row;
const notify = str(old.notifyNumber).trim();
const notifyGroupJid = known.has(notify) ? notify : "";
await prisma.moderationSettings.upsert({
  where: { workspaceId },
  create: {
    workspaceId,
    enabled: false,
    deleteMode: old.deleteMode === 1,
    announceDelete: old.announceDelete === 1,
    announceText: str(old.announceText) || undefined,
    notifyGroupJid,
  },
  update: {
    enabled: false,
    deleteMode: old.deleteMode === 1,
    announceDelete: old.announceDelete === 1,
    ...(str(old.announceText) ? { announceText: str(old.announceText) } : {}),
    notifyGroupJid,
  },
});

// grupos moderados
const oldGroups = all('SELECT "remoteJid", "name", "active" FROM "Group"');
const activeJids = oldGroups.filter((g) => g.active === 1).map((g) => str(g.remoteJid));
const missing = oldGroups.filter((g) => g.active === 1 && !known.has(str(g.remoteJid)));
await prisma.group.updateMany({
  where: { workspaceId, remoteJid: { in: activeJids } },
  data: { moderated: true },
});

// listas
const blocked = all('SELECT "domain" FROM "BlockedDomain"');
const allowed = all('SELECT "domain" FROM "AllowedDomain"');
const invites = all('SELECT "url" FROM "WhitelistLink"');
await prisma.blockedDomain.createMany({
  data: blocked.map((r) => ({ workspaceId, domain: str(r.domain) })),
  skipDuplicates: true,
});
await prisma.allowedDomain.createMany({
  data: allowed.map((r) => ({ workspaceId, domain: str(r.domain) })),
  skipDuplicates: true,
});
await prisma.allowedInvite.createMany({
  data: invites.map((r) => ({ workspaceId, url: str(r.url) })),
  skipDuplicates: true,
});

// links não identificados ainda sem decisão
const unknown = all('SELECT * FROM "UnknownLink"');
await prisma.unknownLink.createMany({
  data: unknown.map((r) => ({
    workspaceId,
    domain: str(r.domain),
    sample: str(r.sample),
    groupName: str(r.groupName),
    author: str(r.author),
    text: str(r.text),
    count: Number(r.count) || 1,
    lastMessageId: str(r.lastMessageId),
    firstSeenAt: date(r.firstSeenAt),
    lastSeenAt: date(r.lastSeenAt),
  })),
  skipDuplicates: true,
});

// histórico dos últimos 90 dias (alimenta o ranking de quem mais manda link)
const since = Date.now() - 90 * 24 * 60 * 60 * 1000;
const events = all('SELECT * FROM "ModerationEvent"').filter((r) => date(r.createdAt).getTime() > since);
await prisma.moderationEvent.createMany({
  data: events.map((r) => ({
    workspaceId,
    groupJid: str(r.groupJid),
    waMessageId: str(r.waMessageId),
    groupName: str(r.groupName),
    author: str(r.author),
    authorName: str(r.authorName),
    authorPhone: str(r.authorPhone),
    participant: str(r.participant),
    participantAlt: str(r.participantAlt),
    text: str(r.text),
    matchedUrl: str(r.matchedUrl),
    // a fila do Modera Bot não tenta apagar mensagem antiga do gerador
    action: str(r.action) === "pending" ? "delete_failed" : str(r.action),
    detail: r.detail == null ? null : str(r.detail),
    attempts: Number(r.attempts) || 0,
    nextAttemptAt: null,
    messageAt: date(r.messageAt),
    createdAt: date(r.createdAt),
  })),
  skipDuplicates: true,
});

console.log(`Conta: ${membership.workspace.name}`);
console.log(`Grupos moderados: ${activeJids.length - missing.length} de ${activeJids.length}`);
for (const g of missing) console.log(`  não encontrado no WhatsApp da conta: ${str(g.name)} (${str(g.remoteJid)})`);
console.log(`Grupo de aviso: ${notifyGroupJid ? "importado" : `não encontrado (${notify || "vazio"})`}`);
console.log(`Bloqueados: ${blocked.length} · Liberados: ${allowed.length} · Convites: ${invites.length}`);
console.log(`Links não identificados: ${unknown.length} · Histórico (90 dias): ${events.length}`);
console.log("A moderação ficou DESLIGADA. Ligue em Regras quando desligar a do gerador.");
await prisma.$disconnect();
