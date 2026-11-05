import { requireWorkspace } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { senderRanks } from "@/lib/moderation";
import { clearEvents, decideUnknown, deleteEvent } from "./actions";
import { ConfirmButton } from "@/components/ConfirmButton";

const ACTION_LABEL: Record<string, string> = {
  notified: "Avisado",
  deleted: "Apagado",
  delete_failed: "Apagar falhou",
  notify_failed: "Falha no aviso",
  deleted_notify_failed: "Apagado, aviso falhou",
  pending: "Processando",
};

function when(date: Date) {
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default async function AlertasPage() {
  const { workspace } = await requireWorkspace();
  const where = { workspaceId: workspace.id };
  const [unknown, events, ranked] = await Promise.all([
    prisma.unknownLink.findMany({ where, orderBy: { lastSeenAt: "desc" }, take: 100 }),
    prisma.moderationEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.moderationEvent.findMany({
      where,
      select: { author: true, authorName: true, authorPhone: true },
    }),
  ]);
  const offenders = senderRanks(ranked).slice(0, 20);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Alertas</h1>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          O que o bot encontrou nos grupos. O histórico guarda os últimos 90 dias.
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <div>
          <h2 className="font-semibold">Links não identificados ({unknown.length})</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Sites que não estão nos bloqueados nem nos liberados. A mensagem ficou no grupo
            e o grupo de aviso recebeu um alerta, uma vez por site. Decida para não
            aparecer de novo.
          </p>
        </div>
        {unknown.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">Nenhum link estranho.</p>
        ) : (
          <ul className="space-y-3">
            {unknown.map((link) => (
              <li key={link.id} className="space-y-2 rounded-xl border border-[var(--line)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {link.domain}{" "}
                    <span className="badge">
                      {link.count} {link.count === 1 ? "vez" : "vezes"}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <form action={decideUnknown.bind(null, link.id, "allow")}>
                      <button type="submit" className="btn btn-secondary text-sm">
                        Liberar
                      </button>
                    </form>
                    <form action={decideUnknown.bind(null, link.id, "block")}>
                      <button type="submit" className="btn btn-danger text-sm">
                        Bloquear
                      </button>
                    </form>
                    <form action={decideUnknown.bind(null, link.id, "dismiss")}>
                      <button type="submit" className="btn btn-secondary text-sm" title="Tira da lista sem decidir. Se aparecer de novo, avisa de novo.">
                        Ignorar
                      </button>
                    </form>
                  </div>
                </div>
                <p className="text-[var(--ink-soft)]">
                  {link.groupName} · {link.author} · {when(link.lastSeenAt)}
                </p>
                <p className="break-all">{link.sample}</p>
                <details>
                  <summary className="cursor-pointer text-[var(--ink-soft)]">Mensagem</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-[#fffdf8] p-3">
                    {link.text}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Quem mais mandou link bloqueado</h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Uma vez pode ter sido sem querer. Quem chegou a três, vale tirar do grupo.
        </p>
        {offenders.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">Ninguém ainda.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {offenders.map((person) => (
              <div
                key={person.phone ?? person.name}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3"
              >
                <span className="font-medium">{person.name}</span>
                <span>{person.phone ? `+${person.phone}` : "sem telefone"}</span>
                <span className={`justify-self-end ${person.count >= 3 ? "badge badge-warn" : "badge"}`}>
                  {person.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Histórico</h2>
          {events.length > 0 && (
            <ConfirmButton
              action={clearEvents}
              message="Apagar todo o histórico de alertas?"
              label="Apagar todos"
            />
          )}
        </div>
        {events.length === 0 ? (
          <div className="card p-5 text-sm text-[var(--ink-soft)]">Nenhum link bloqueado ainda.</div>
        ) : (
          events.map((event) => (
            <article key={event.id} className="card space-y-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{event.groupName}</p>
                <div className="flex items-center gap-2">
                  <span className={`badge ${event.action === "deleted" ? "" : "badge-warn"}`}>
                    {ACTION_LABEL[event.action] ?? event.action}
                  </span>
                  <form action={deleteEvent.bind(null, event.id)}>
                    <button type="submit" className="btn btn-danger text-sm">
                      Apagar
                    </button>
                  </form>
                </div>
              </div>
              <p className="text-sm text-[var(--ink-soft)]">
                {event.author} · {when(event.messageAt)}
              </p>
              <p className="break-all text-sm">{event.matchedUrl}</p>
              <pre className="whitespace-pre-wrap rounded-xl bg-[#fffdf8] p-3 text-sm">{event.text}</pre>
              {event.detail && <p className="text-sm text-[var(--warn)]">{event.detail}</p>}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
