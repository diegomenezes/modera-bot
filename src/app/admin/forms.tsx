"use client";

import { useActionState } from "react";
import { createClient, resetPassword } from "./actions";

export function CreateClientForm() {
  const [state, action, pending] = useActionState(createClient, undefined);

  return (
    <form action={action} className="space-y-3">
      <input name="name" className="field" placeholder="Nome da pessoa" required />
      <input name="email" type="email" className="field" placeholder="E-mail" required />
      <input
        name="password"
        className="field"
        placeholder="Senha provisória (mínimo 8 caracteres)"
        minLength={8}
        autoComplete="off"
        required
      />
      <input
        name="workspace"
        className="field"
        placeholder="Nome da conta (opcional, ex.: nome da loja)"
      />
      {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
      {state?.ok && <p className="text-sm text-[var(--accent)]">{state.ok}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Criando..." : "Criar cliente"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="password"
        className="field"
        placeholder="Senha nova"
        minLength={8}
        autoComplete="off"
        required
      />
      <button type="submit" className="btn btn-secondary text-sm" disabled={pending}>
        {pending ? "Salvando..." : "Trocar"}
      </button>
      {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
      {state?.ok && <p className="text-sm text-[var(--accent)]">{state.ok}</p>}
    </form>
  );
}
