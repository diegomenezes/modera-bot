import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { connectionState } from "@/lib/evolution";
import { impersonate } from "../actions";

export const dynamic = "force-dynamic";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const ACTION_LABEL: Record<string, string> = {
  notified: "Avisado",
  deleted: "Apagado",
  delete_failed: "Apagar falhou",
  notify_failed: "Falha no aviso",
  deleted_notify_failed: "Apagado, aviso falhou",
  pending: "Processando",
};

function ago(date: Date | null | undefined): string {
  if (!date) return "nunca";
  const diff = Date.now() - date.getTime();
  if (diff < 2 * 60_000) return "agora há pouco";
  if (diff < HOUR) return `há ${Math.round(diff / 60_000)} min`;
  if (diff < DAY) return `há ${Math.round(diff / HOUR)} h`;
  return `há ${Math.round(diff / DAY)} dia(s)`;
}

function when(date: Date) {
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

type Problem = { level: "erro" | "atencao" | "info"; text: string };

export default async function RelatorioPage() {
  await requireAdmin();
  // página do servidor, montada uma vez por acesso: a hora atual é o que se quer
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const since24h = new Date(now - DAY);
  const since7d = new Date(now - 7 * DAY);

  const [workspaces, byAction7d, byAction24h, retrying, gaveUpCounts, unknownCounts, lastEvents, recent] =
    await Promise.all([
      prisma.workspace.findMany({
        orderBy: { createdAt: "asc" },
        include: {
          memberships: { include: { user: { select: { id: true, name: true, email: true, banned: true } } } },
          instance: true,
          settings: true,
          groups: { where: { moderated: true }, select: { name: true, botIsAdmin: true } },
        },
      }),
      prisma.moderationEvent.groupBy({
        by: ["workspaceId", "action"],
        where: { createdAt: { gt: since7d } },
        _count: true,
      }),
      prisma.moderationEvent.groupBy({
        by: ["workspaceId"],
        where: { createdAt: { gt: since24h } },
        _count: true,
      }),
      prisma.moderationEvent.groupBy({
        by: ["workspaceId"],
        where: { action: { in: ["delete_failed", "pending"] }, nextAttemptAt: { not: null } },
        _count: true,
      }),
      prisma.moderationEvent.groupBy({
        by: ["workspaceId"],
        where: { action: "delete_failed", nextAttemptAt: null, createdAt: { gt: since7d } },
        _count: true,
      }),
      prisma.unknownLink.groupBy({ by: ["workspaceId"], _count: true }),
      prisma.moderationEvent.groupBy({ by: ["workspaceId"], _max: { createdAt: true } }),
      prisma.moderationEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { workspace: { select: { name: true } } },
      }),
    ]);

  // status de verdade na Evolution, não o que ficou guardado
  const live = new Map(
    await Promise.all(
      workspaces
        .filter((w) => w.instance)
        .map(async (w) => [w.id, await connectionState(w.instance!.name).catch(() => "unknown")] as const),
    ),
  );

  const count7d = (id: string, action: string) =>
    byAction7d.find((r) => r.workspaceId === id && r.action === action)?._count ?? 0;

  const rows = workspaces.map((w) => {
    const user = w.memberships[0]?.user;
    const state = w.instance ? (live.get(w.id) ?? "unknown") : null;
    const notAdmin = w.groups.filter((g) => !g.botIsAdmin);
    const gaveUp = gaveUpCounts.find((r) => r.workspaceId === w.id)?._count ?? 0;
    const queue = retrying.find((r) => r.workspaceId === w.id)?._count ?? 0;
    const notifyFailed = count7d(w.id, "notify_failed") + count7d(w.id, "deleted_notify_failed");
    const problems: Problem[] = [];

    if (user?.banned) problems.push({ level: "info", text: "Acesso bloqueado: moderação pausada." });
    if (!w.instance) problems.push({ level: "atencao", text: "WhatsApp nunca foi conectado." });
    else if (state !== "open") {
      problems.push({ level: "erro", text: `WhatsApp fora do ar (Evolution: ${state}). Não está moderando.` });
    } else if (w.settings?.enabled && (!w.instance.lastWebhookAt || now - w.instance.lastWebhookAt.getTime() > 3 * HOUR)) {
      problems.push({
        level: "atencao",
        text: `Nenhuma mensagem da Evolution ${ago(w.instance.lastWebhookAt)}. Pode ser grupo parado ou webhook parado.`,
      });
    }
    if (w.instance && w.groups.length === 0) problems.push({ level: "atencao", text: "Nenhum grupo moderado." });
    if (w.groups.length > 0 && !w.settings?.notifyGroupJid) {
      problems.push({ level: "atencao", text: "Grupo de aviso não escolhido: os alertas não chegam." });
    }
    if (w.settings && !w.settings.enabled && w.groups.length > 0) {
      problems.push({ level: "info", text: "Moderação desligada." });
    }
    if (w.settings?.deleteMode && notAdmin.length > 0) {
      problems.push({
        level: "erro",
        text: `Bot não é admin em ${notAdmin.length} grupo(s) moderado(s), não consegue apagar: ${notAdmin.map((g) => g.name).join(", ")}.`,
      });
    }
    if (queue > 0) problems.push({ level: "atencao", text: `${queue} exclusão(ões) na fila de nova tentativa.` });
    if (gaveUp > 0) {
      problems.push({ level: "erro", text: `${gaveUp} exclusão(ões) não foram apagadas em 7 dias (desisti ou apagar estava desligado).` });
    }
    if (notifyFailed > 0) {
      problems.push({ level: "erro", text: `${notifyFailed} aviso(s) não chegaram ao grupo de aviso em 7 dias.` });
    }

    return {
      w,
      user,
      state,
      problems,
      events24h: byAction24h.find((r) => r.workspaceId === w.id)?._count ?? 0,
      deleted7d: count7d(w.id, "deleted") + count7d(w.id, "deleted_notify_failed"),
      notified7d: count7d(w.id, "notified") + count7d(w.id, "notify_failed"),
      unknown: unknownCounts.find((r) => r.workspaceId === w.id)?._count ?? 0,
      lastEvent: lastEvents.find((r) => r.workspaceId === w.id)?._max.createdAt ?? null,
    };
  });

  const totals = {
    clients: rows.length,
    online: rows.filter((r) => r.state === "open").length,
    moderating: rows.filter((r) => r.state === "open" && r.w.settings?.enabled && r.w.active && r.w.groups.length > 0).length,
    groups: rows.reduce((s, r) => s + r.w.groups.length, 0),
    events24h: rows.reduce((s, r) => s + r.events24h, 0),
    errors: rows.filter((r) => r.problems.some((p) => p.level === "erro")).length,
  };

  const levelStyle: Record<Problem["level"], string> = {
    erro: "text-[#b91c1c]",
    atencao: "text-[var(--warn)]",
    info: "text-[var(--ink-soft)]",
  };

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Relatório</h1>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          O que está acontecendo com cada cliente. O status do WhatsApp é conferido na
          Evolution agora, ao abrir esta página.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Clientes", totals.clients],
          ["WhatsApp no ar", totals.online],
          ["Moderando", totals.moderating],
          ["Grupos moderados", totals.groups],
          ["Alertas em 24h", totals.events24h],
          ["Com erro", totals.errors],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-sm text-[var(--ink-soft)]">{label}</p>
            <p className={`text-2xl font-semibold ${label === "Com erro" && Number(value) > 0 ? "text-[#b91c1c]" : ""}`}>
              {value}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Por cliente</h2>
        {rows.length === 0 && <p className="text-sm text-[var(--ink-soft)]">Nenhum cliente ainda.</p>}
        {rows.map((r) => (
          <article key={r.w.id} className="card space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {r.w.name}{" "}
                  <span className={`badge ${r.state === "open" ? "" : "badge-warn"}`}>
                    {r.state === null ? "sem WhatsApp" : r.state === "open" ? "no ar" : r.state}
                  </span>
                </p>
                <p className="text-sm text-[var(--ink-soft)]">
                  {r.user ? `${r.user.name} · ${r.user.email}` : "sem usuário"}
                  {r.w.instance?.phone ? ` · +${r.w.instance.phone}` : ""}
                  {r.w.instance ? ` · ${r.w.instance.name}` : ""}
                </p>
              </div>
              {r.user && !r.user.banned && (
                <form action={impersonate.bind(null, r.user.id)}>
                  <button type="submit" className="btn btn-secondary text-sm">
                    Entrar como
                  </button>
                </form>
              )}
            </div>

            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-[var(--ink-soft)]">Moderação</dt>
                <dd>
                  {r.w.settings?.enabled ? "ligada" : "desligada"}
                  {r.w.settings?.enabled ? (r.w.settings.deleteMode ? ", apagando" : ", só avisando") : ""}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">Grupos moderados</dt>
                <dd>{r.w.groups.length}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">Última mensagem da Evolution</dt>
                <dd>{ago(r.w.instance?.lastWebhookAt)}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">Último alerta</dt>
                <dd>{ago(r.lastEvent)}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">Alertas em 24h</dt>
                <dd>{r.events24h}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">Em 7 dias</dt>
                <dd>
                  {r.deleted7d} apagado(s), {r.notified7d} só avisado(s)
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">Links esperando decisão</dt>
                <dd>{r.unknown}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]">Cliente desde</dt>
                <dd>{r.w.createdAt.toLocaleDateString("pt-BR")}</dd>
              </div>
            </dl>

            {r.problems.length > 0 ? (
              <ul className="space-y-1 border-t border-[var(--line)] pt-3 text-sm">
                {r.problems.map((p) => (
                  <li key={p.text} className={levelStyle[p.level]}>
                    {p.level === "erro" ? "● " : p.level === "atencao" ? "▲ " : "· "}
                    {p.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-[var(--line)] pt-3 text-sm text-[var(--accent)]">
                Tudo certo.
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Atividade recente (todos os clientes)</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">Nenhum alerta ainda.</p>
        ) : (
          <div className="card divide-y divide-[var(--line)] text-sm">
            {recent.map((e) => (
              <div key={e.id} className="space-y-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <span className="font-medium">{e.workspace.name}</span> · {e.groupName}
                  </p>
                  <span className={`badge ${e.action === "deleted" ? "" : "badge-warn"}`}>
                    {ACTION_LABEL[e.action] ?? e.action}
                    {e.attempts > 1 ? ` · ${e.attempts} tentativas` : ""}
                  </span>
                </div>
                <p className="text-[var(--ink-soft)]">
                  {e.author} · {when(e.createdAt)}
                </p>
                <p className="break-all">{e.matchedUrl.split("\n").join(", ")}</p>
                {e.detail && <p className="text-[var(--warn)]">{e.detail}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
