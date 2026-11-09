import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { syncGroups } from "./whatsapp";

// Link redirecionador: /grupo-<slug> manda cada pessoa para o grupo moderado mais vazio
// que ainda tem vaga. Entram só os grupos com link de convite (bot admin).

export const GROUP_LIMIT = 1000;
// recontagem real de membros enquanto o link recebe acessos
const RECOUNT_MS = 10 * 60_000;
const recounting = new Map<string, number>();

export function redirectPath(slug: string) {
  return `/grupo-${slug}`;
}

export async function ensureRedirectSlug(workspaceId: string): Promise<string> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { redirectSlug: true },
  });
  if (workspace?.redirectSlug) return workspace.redirectSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomBytes(4).toString("hex").slice(0, 6);
    try {
      await prisma.workspace.update({ where: { id: workspaceId }, data: { redirectSlug: slug } });
      return slug;
    } catch {
      // colisão rara de slug: tenta outro
    }
  }
  throw new Error("Não consegui criar o link.");
}

export type RedirectGroup = {
  id: string;
  name: string;
  members: number; // contagem real + cliques desde a última contagem
  vacancies: number;
  inviteUrl: string | null;
};

export async function getRedirectGroups(workspaceId: string) {
  const [groups, invites] = await Promise.all([
    prisma.group.findMany({
      where: { workspaceId, moderated: true },
      orderBy: { name: "asc" },
    }),
    prisma.allowedInvite.findMany({
      where: { workspaceId, groupJid: { not: null } },
      select: { groupJid: true, url: true },
    }),
  ]);
  const inviteByJid = new Map(invites.map((i) => [i.groupJid, i.url]));

  const rows: RedirectGroup[] = groups.map((g) => {
    const members = g.size + g.redirectClicks;
    return {
      id: g.id,
      name: g.name,
      members,
      vacancies: Math.max(0, GROUP_LIMIT - members),
      inviteUrl: inviteByJid.get(g.remoteJid) ?? null,
    };
  });
  const usable = rows.filter((g) => g.inviteUrl);
  const oldestSync = groups.reduce<Date | null>(
    (min, g) => (!min || g.syncedAt < min ? g.syncedAt : min),
    null,
  );
  return {
    rows,
    usable,
    totalVacancies: usable.reduce((sum, g) => sum + g.vacancies, 0),
    oldestSync,
  };
}

// Escolhe o grupo e já conta o clique, para o próximo acesso ir para outro grupo.
export async function pickGroup(slug: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { redirectSlug: slug },
    select: { id: true, active: true },
  });
  if (!workspace) return { kind: "not-found" as const };
  if (!workspace.active) return { kind: "unavailable" as const };

  const { usable, oldestSync } = await getRedirectGroups(workspace.id);
  const open = usable
    .filter((g) => g.vacancies > 0)
    .sort((a, b) => a.members - b.members || a.name.localeCompare(b.name, "pt-BR"));
  const target = open[0];
  if (target) {
    await prisma.group.update({
      where: { id: target.id },
      data: { redirectClicks: { increment: 1 } },
    });
  }

  const stale = !oldestSync || Date.now() - oldestSync.getTime() > RECOUNT_MS;
  return {
    kind: target ? ("ok" as const) : ("full" as const),
    workspaceId: workspace.id,
    url: target?.inviteUrl ?? null,
    needsRecount: stale,
  };
}

// Atualiza o número real de membros (zera os cliques estimados). No máximo uma vez por janela.
export async function recountIfIdle(workspaceId: string) {
  const last = recounting.get(workspaceId) ?? 0;
  if (Date.now() - last < RECOUNT_MS) return;
  recounting.set(workspaceId, Date.now());
  try {
    await syncGroups(workspaceId);
  } catch (err) {
    console.error(`[redirecionador] recontagem ${workspaceId}:`, err);
  }
}
