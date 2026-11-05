import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const DAY = 24 * 60 * 60 * 1000;

const ACTION_LABEL: Record<string, string> = {
  notified: "Avisado",
  deleted: "Apagado",
  delete_failed: "Apagar falhou",
  notify_failed: "Falha no aviso",
  deleted_notify_failed: "Apagado, aviso falhou",
  pending: "Processando",
};

const TYPES: Record<string, { label: string; actions?: string[] }> = {
  todos: { label: "Todos os links bloqueados" },
  apagados: { label: "Apagados", actions: ["deleted", "deleted_notify_failed"] },
  avisados: { label: "Só avisados (apagar desligado)", actions: ["notified", "notify_failed"] },
  falhas: {
    label: "Com falha",
    actions: ["delete_failed", "notify_failed", "deleted_notify_failed", "pending"],
  },
};

const PERIODS: Record<string, { label: string; days: number }> = {
  "1": { label: "Últimas 24 horas", days: 1 },
  "7": { label: "Últimos 7 dias", days: 7 },
  "30": { label: "Últimos 30 dias", days: 30 },
  "90": { label: "Últimos 90 dias", days: 90 },
};

function when(date: Date) {
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function AtividadePage({ searchParams }: PageProps<"/admin/atividade">) {
  await requireAdmin();
  const params = await searchParams;
  const cliente = one(params.cliente);
  const tipo = TYPES[one(params.tipo)] ? one(params.tipo) : "todos";
  const periodo = PERIODS[one(params.periodo)] ? one(params.periodo) : "7";
  const busca = one(params.busca).slice(0, 100);
  const page = Math.max(1, Number.parseInt(one(params.pagina), 10) || 1);

  // página do servidor, montada uma vez por acesso: a hora atual é o que se quer
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - PERIODS[periodo].days * DAY);
  const actions = TYPES[tipo].actions;
  const where: Prisma.ModerationEventWhereInput = {
    createdAt: { gt: since },
    ...(cliente ? { workspaceId: cliente } : {}),
    ...(actions ? { action: { in: actions } } : {}),
    ...(busca
      ? {
          OR: [
            { author: { contains: busca, mode: "insensitive" } },
            { authorPhone: { contains: busca.replace(/\D/g, "") || busca } },
            { matchedUrl: { contains: busca, mode: "insensitive" } },
            { groupName: { contains: busca, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [workspaces, total, events] = await Promise.all([
    prisma.workspace.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.moderationEvent.count({ where }),
    prisma.moderationEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { workspace: { select: { name: true } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (target: number) => {
    const query = new URLSearchParams({
      ...(cliente ? { cliente } : {}),
      tipo,
      periodo,
      ...(busca ? { busca } : {}),
      pagina: String(target),
    });
    return `/admin/atividade?${query}`;
  };

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Atividade</h1>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          Os links bloqueados que o bot encontrou nos grupos de todos os clientes.
        </p>
      </section>

      <form method="get" className="card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <select name="cliente" defaultValue={cliente} className="field">
          <option value="">Todos os clientes</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select name="tipo" defaultValue={tipo} className="field">
          {Object.entries(TYPES).map(([value, t]) => (
            <option key={value} value={value}>
              {t.label}
            </option>
          ))}
        </select>
        <select name="periodo" defaultValue={periodo} className="field">
          {Object.entries(PERIODS).map(([value, p]) => (
            <option key={value} value={value}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          name="busca"
          defaultValue={busca}
          className="field"
          placeholder="Nome, telefone, link ou grupo"
        />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary text-sm">
            Filtrar
          </button>
          <Link href="/admin/atividade" className="btn btn-secondary text-sm">
            Limpar
          </Link>
        </div>
      </form>

      <p className="text-sm text-[var(--ink-soft)]">
        {total} resultado(s){total > PAGE_SIZE ? ` · página ${page} de ${pages}` : ""}
      </p>

      {events.length === 0 ? (
        <div className="card p-5 text-sm text-[var(--ink-soft)]">Nada encontrado com esses filtros.</div>
      ) : (
        <div className="card divide-y divide-[var(--line)] text-sm">
          {events.map((e) => (
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

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={href(page - 1)} className="btn btn-secondary text-sm">
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-[var(--ink-soft)]">
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className="btn btn-secondary text-sm">
              Próximos →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
