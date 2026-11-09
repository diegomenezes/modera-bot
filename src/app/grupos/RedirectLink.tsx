import { GROUP_LIMIT, type RedirectGroup } from "@/lib/redirect";
import { CopyButton } from "./CopyButton";

export function RedirectLink({
  url,
  rows,
  totalVacancies,
  usableCount,
}: {
  url: string;
  rows: RedirectGroup[];
  totalVacancies: number;
  usableCount: number;
}) {
  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Link de Convite Redirecionado</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Divulgue este link no lugar dos convites dos grupos. Cada pessoa vai para o grupo
          moderado mais vazio que ainda tem vaga (limite de {GROUP_LIMIT} pessoas), para os
          grupos encherem por igual.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <code className="field min-w-0 flex-1 truncate">{url}</code>
        <CopyButton text={url} />
      </div>

      <div className="flex flex-wrap gap-6">
        <p>
          <span className="text-sm text-[var(--ink-soft)]">Vagas Total</span>
          <br />
          <strong className="text-2xl">{totalVacancies.toLocaleString("pt-BR")}</strong>
        </p>
        <p>
          <span className="text-sm text-[var(--ink-soft)]">Grupos Total</span>
          <br />
          <strong className="text-2xl">{usableCount}</strong>
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--warn)]">
          Nenhum grupo moderado ainda. Marque os grupos abaixo e salve.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)] text-sm">
          {rows.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate">{g.name}</span>
              {g.inviteUrl ? (
                <span className="text-[var(--ink-soft)]">
                  {g.members} pessoas ·{" "}
                  {g.vacancies > 0 ? (
                    <span className="badge">{g.vacancies} vagas</span>
                  ) : (
                    <span className="badge badge-warn">cheio</span>
                  )}
                </span>
              ) : (
                <span className="badge badge-muted">fora do link: o bot não é admin</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {usableCount > 0 && (
        <p className="text-sm">
          Membros nos Grupos:{" "}
          <strong>
            {rows
              .filter((g) => g.inviteUrl)
              .reduce((sum, g) => sum + g.members, 0)
              .toLocaleString("pt-BR")}
          </strong>
        </p>
      )}

      <p className="text-xs text-[var(--ink-soft)]">
        A contagem de pessoas é atualizada do WhatsApp a cada 10 minutos enquanto o link
        recebe acessos; entre uma contagem e outra, cada clique conta como uma pessoa a mais.
      </p>
    </section>
  );
}
