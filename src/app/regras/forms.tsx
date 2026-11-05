"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions";
import { submitWithoutReset } from "@/lib/form";
import { refreshInvites, saveSettings, sendTestAlert, testDelete } from "./actions";

export function SettingsForm(props: {
  enabled: boolean;
  deleteMode: boolean;
  announceDelete: boolean;
  announceText: string;
}) {
  const [state, action, pending] = useActionState(saveSettings, undefined);
  const [enabled, setEnabled] = useState(props.enabled);

  return (
    <form onSubmit={submitWithoutReset(action)} className="space-y-4">
      <div>
        <h2 className="font-semibold">Moderação</h2>
        <p
          className={`mt-1 text-sm ${enabled ? "text-[var(--accent)]" : "text-[var(--warn)]"}`}
        >
          {enabled
            ? "Ligada: o bot está olhando os links dos grupos moderados."
            : "Desligada: o bot não faz nada nos grupos."}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Moderação ligada
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="deleteMode" defaultChecked={props.deleteMode} className="mt-1" />
        <span>
          Apagar a mensagem com link bloqueado
          <span className="block text-[var(--ink-soft)]">
            Desligado, o bot só avisa no grupo de aviso. Bom para começar e conferir.
          </span>
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="announceDelete" defaultChecked={props.announceDelete} />
        Avisar no grupo que a mensagem foi apagada
      </label>
      <div className="space-y-1">
        <label className="text-sm text-[var(--ink-soft)]" htmlFor="announceText">
          Mensagem depois de apagar
        </label>
        <textarea
          id="announceText"
          name="announceText"
          className="field min-h-24"
          defaultValue={props.announceText}
          maxLength={1000}
        />
        <p className="text-sm text-[var(--ink-soft)]">
          *assim* fica em negrito no WhatsApp. No final, o bot marca quem mandou o link.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </button>
        {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
        {state?.ok && <p className="text-sm text-[var(--accent)]">{state.ok}</p>}
      </div>
    </form>
  );
}

export function TestAlertButton() {
  const [alertState, alertAction, alertPending] = useActionState(
    async () => sendTestAlert(),
    undefined,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    async () => testDelete(),
    undefined,
  );
  const state = deleteState ?? alertState;

  return (
    <div className="space-y-2 border-t border-[var(--line)] pt-4">
      <div className="flex flex-wrap gap-2">
        <form action={alertAction}>
          <button type="submit" className="btn btn-secondary text-sm" disabled={alertPending || deletePending}>
            {alertPending ? "Enviando..." : "Mandar teste no grupo de aviso"}
          </button>
        </form>
        <form action={deleteAction}>
          <button type="submit" className="btn btn-secondary text-sm" disabled={alertPending || deletePending}>
            {deletePending ? "Testando..." : "Testar apagar"}
          </button>
        </form>
      </div>
      <p className="text-sm text-[var(--ink-soft)]">
        Testar apagar manda uma frase no grupo de aviso, apaga para todos e manda a
        mensagem pós-exclusão. Se funcionar ali, funciona nos grupos onde o bot é admin.
      </p>
      {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
      {state?.ok && <p className="text-sm text-[var(--accent)]">{state.ok}</p>}
    </div>
  );
}

export function AddItemForm({
  action: serverAction,
  name,
  placeholder,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  name: string;
  placeholder: string;
}) {
  const [state, action, pending] = useActionState(serverAction, undefined);

  return (
    <form action={action} className="space-y-1">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name={name} className="field" placeholder={placeholder} required />
        <button type="submit" className="btn btn-secondary shrink-0 text-sm" disabled={pending}>
          Adicionar
        </button>
      </div>
      {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
    </form>
  );
}

export function RefreshInvitesButton() {
  const [state, action, pending] = useActionState(async () => refreshInvites(), undefined);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn btn-secondary text-sm" disabled={pending}>
        {pending ? "Atualizando..." : "Atualizar convites dos grupos agora"}
      </button>
      {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
      {state?.ok && <p className="text-sm text-[var(--accent)]">{state.ok}</p>}
    </form>
  );
}
