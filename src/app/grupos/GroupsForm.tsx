"use client";

import { useActionState, useState } from "react";
import { refreshGroups, saveGroups } from "./actions";

type GroupRow = {
  remoteJid: string;
  name: string;
  size: number;
  botIsAdmin: boolean;
  moderated: boolean;
};

export function RefreshButton({ hasGroups }: { hasGroups: boolean }) {
  const [state, action, pending] = useActionState(refreshGroups, undefined);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        className={`btn text-sm ${hasGroups ? "btn-secondary" : "btn-primary"}`}
        disabled={pending}
      >
        {pending ? "Buscando grupos..." : hasGroups ? "Atualizar lista" : "Buscar meus grupos"}
      </button>
      {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
      {state?.ok && <p className="text-sm text-[var(--ink-soft)]">{state.ok}</p>}
    </form>
  );
}

export function GroupsForm({
  groups,
  notifyGroupJid,
}: {
  groups: GroupRow[];
  notifyGroupJid: string;
}) {
  const [state, action, pending] = useActionState(saveGroups, undefined);
  const [filter, setFilter] = useState("");
  const [notify, setNotify] = useState(notifyGroupJid);
  const term = filter.trim().toLowerCase();

  return (
    <form action={action} className="space-y-6">
      <section className="card space-y-3 p-5">
        <div>
          <h2 className="font-semibold">Grupo que recebe os avisos</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Os alertas de link bloqueado e de link estranho chegam aqui.
          </p>
        </div>
        <select
          name="notify"
          className="field"
          value={notify}
          onChange={(e) => setNotify(e.target.value)}
        >
          <option value="">Escolha um grupo</option>
          {groups.map((g) => (
            <option key={g.remoteJid} value={g.remoteJid}>
              {g.name}
            </option>
          ))}
        </select>
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Grupos moderados</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {groups.length} grupo(s) em que o número do bot participa.
            </p>
          </div>
          {groups.length > 8 && (
            <input
              className="field max-w-xs"
              placeholder="Filtrar pelo nome"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
        </div>
        <ul className="divide-y divide-[var(--line)]">
          {groups.map((g) => {
            const hidden = term && !g.name.toLowerCase().includes(term);
            const isNotify = g.remoteJid === notify;
            return (
              <li key={g.remoteJid} className={hidden ? "hidden" : "py-3"}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    name="moderated"
                    value={g.remoteJid}
                    defaultChecked={g.moderated}
                    disabled={isNotify}
                    className="mt-1.5 h-4 w-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{g.name}</span>
                    <span className="block text-sm text-[var(--ink-soft)]">
                      {g.size} participantes
                      {isNotify ? " · grupo de aviso" : ""}
                    </span>
                  </span>
                  {g.botIsAdmin ? (
                    <span className="badge shrink-0">bot é admin</span>
                  ) : (
                    <span className="badge badge-warn shrink-0" title="Sem ser admin, o bot avisa mas não consegue apagar">
                      bot não é admin
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-[var(--ink-soft)]">
          Onde o bot não é admin, ele só consegue avisar, não apagar. Promova o número do
          bot a admin no próprio grupo e toque em Atualizar lista.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </button>
        {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
        {state?.ok && <p className="text-sm text-[var(--accent)]">{state.ok}</p>}
      </div>
    </form>
  );
}
