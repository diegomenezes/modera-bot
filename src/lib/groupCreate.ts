import "server-only";
import { prisma } from "./db";
import {
  createGroup,
  fetchGroupDetails,
  fetchInviteUrl,
  updateGroupDescription,
  updateGroupPicture,
  updateGroupSetting,
} from "./evolution";
import { getInstance, normalizePhone, syncGroups, syncInviteLinks } from "./whatsapp";

// "Criar grupo": a partir do último grupo de uma série ("Nome #7") cria o próximo ("Nome #8"),
// copiando descrição, admins e foto. Tudo recebe o workspaceId já validado pelo dal.ts.

const SERIES = /^(.*?\S)\s*#\s*(\d+)\s*$/;

export function parseSeries(name: string): { base: string; number: number } | null {
  const match = SERIES.exec(name.trim());
  return match ? { base: match[1], number: Number(match[2]) } : null;
}

export type SeriesInfo = {
  base: string;
  lastJid: string;
  lastName: string;
  nextName: string;
};

// Uma entrada por série, com o grupo de número mais alto. Séries moderadas vêm primeiro.
export async function listSeries(workspaceId: string): Promise<SeriesInfo[]> {
  const groups = await prisma.group.findMany({
    where: { workspaceId },
    select: { remoteJid: true, name: true, moderated: true },
  });
  const best = new Map<string, { jid: string; name: string; number: number; moderated: boolean }>();
  for (const g of groups) {
    const parsed = parseSeries(g.name);
    if (!parsed) continue;
    const key = parsed.base.toLowerCase();
    const current = best.get(key);
    if (!current || parsed.number > current.number) {
      best.set(key, {
        jid: g.remoteJid,
        name: g.name,
        number: parsed.number,
        moderated: g.moderated || Boolean(current?.moderated),
      });
    } else if (g.moderated) {
      current.moderated = true;
    }
  }
  return [...best.values()]
    .sort((a, b) => Number(b.moderated) - Number(a.moderated) || a.name.localeCompare(b.name, "pt-BR"))
    .map((s) => {
      const base = parseSeries(s.name)!.base;
      return { base, lastJid: s.jid, lastName: s.name, nextName: `${base} #${s.number + 1}` };
    });
}

async function openInstance(workspaceId: string) {
  const instance = await getInstance(workspaceId);
  if (!instance || instance.status !== "open") {
    throw new Error("Conecte o WhatsApp antes de criar grupos.");
  }
  return instance;
}

async function findSeries(workspaceId: string, sourceJid: string) {
  const series = (await listSeries(workspaceId)).find((s) => s.lastJid === sourceJid);
  if (!series) throw new Error("Grupo de origem não encontrado. Toque em Atualizar lista.");
  return series;
}

export type NewGroupDraft = {
  sourceJid: string;
  sourceName: string;
  nextName: string;
  description: string;
  admins: string[];
  pictureUrl: string | null;
};

export async function draftNextGroup(workspaceId: string, sourceJid: string): Promise<NewGroupDraft> {
  const instance = await openInstance(workspaceId);
  const series = await findSeries(workspaceId, sourceJid);
  const details = await fetchGroupDetails(instance.name, sourceJid);
  return {
    sourceJid,
    sourceName: series.lastName,
    nextName: series.nextName,
    description: details.description,
    // o próprio número do bot já entra como criador do grupo
    admins: details.adminPhones.filter((p) => p !== instance.phone),
    pictureUrl: details.pictureUrl,
  };
}

const INVITE = /https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/g;

// Troca na descrição o convite do grupo antigo pelo do novo. Se o convite antigo não estiver
// lá (foi redefinido, por exemplo), troca qualquer convite do WhatsApp.
export function swapInvite(description: string, oldUrl: string | null, newUrl: string): string {
  if (oldUrl && description.includes(oldUrl)) return description.split(oldUrl).join(newUrl);
  return description.replace(INVITE, newUrl);
}

export type CreateResult = { name: string; done: string[]; failed: string[] };

export async function createNextGroup(
  workspaceId: string,
  input: { sourceJid: string; description: string; admins: string[]; pictureBase64: string | null },
): Promise<CreateResult> {
  const instance = await openInstance(workspaceId);
  const series = await findSeries(workspaceId, input.sourceJid);

  const admins = [
    ...new Set(input.admins.map(normalizePhone).filter((p): p is string => Boolean(p))),
  ].filter((p) => p !== instance.phone);
  if (admins.length === 0) {
    throw new Error("Coloque pelo menos um número de admin. O WhatsApp não cria grupo vazio.");
  }

  const [source, oldInvite] = await Promise.all([
    prisma.group.findUnique({
      where: { workspaceId_remoteJid: { workspaceId, remoteJid: input.sourceJid } },
    }),
    fetchInviteUrl(instance.name, input.sourceJid).catch(() => null),
  ]);
  const pictureUrl = input.pictureBase64
    ? null
    : await fetchGroupDetails(instance.name, input.sourceJid)
        .then((d) => d.pictureUrl)
        .catch(() => null);

  const jid = await createGroup(instance.name, {
    subject: series.nextName,
    participants: admins,
  });

  const done = [`Grupo ${series.nextName} criado com ${admins.length} admin(s).`];
  const failed: string[] = [];
  const step = async (ok: string, run: () => Promise<unknown>) => {
    try {
      await run();
      done.push(ok);
    } catch (err) {
      failed.push(err instanceof Error ? err.message : String(err));
    }
  };

  await step("Só admins podem mudar os dados do grupo.", () =>
    updateGroupSetting(instance.name, jid, "locked"),
  );

  const newInvite = await fetchInviteUrl(instance.name, jid).catch(() => null);
  if (input.description.trim()) {
    if (newInvite) {
      await step("Descrição copiada com o link novo.", () =>
        updateGroupDescription(instance.name, jid, swapInvite(input.description, oldInvite, newInvite)),
      );
    } else {
      failed.push("Não consegui o link de convite do grupo novo, então a descrição não foi posta.");
    }
  }

  const image = input.pictureBase64 ?? pictureUrl;
  if (image) {
    await step("Foto do grupo colocada.", () => updateGroupPicture(instance.name, jid, image));
  }

  // grupo novo entra na lista e, se a série é moderada, já fica moderado e no link redirecionado
  try {
    await syncGroups(workspaceId);
    // a lista do WhatsApp às vezes demora a trazer o grupo recém-criado
    await prisma.group.upsert({
      where: { workspaceId_remoteJid: { workspaceId, remoteJid: jid } },
      create: {
        workspaceId,
        remoteJid: jid,
        name: series.nextName,
        size: admins.length + 1,
        botIsAdmin: true,
        moderated: Boolean(source?.moderated),
      },
      update: { moderated: Boolean(source?.moderated) },
    });
    if (source?.moderated) {
      await syncInviteLinks(workspaceId);
      done.push("Grupo já está moderado e no link redirecionado.");
    }
  } catch (err) {
    failed.push(err instanceof Error ? err.message : String(err));
  }

  return { name: series.nextName, done, failed };
}
