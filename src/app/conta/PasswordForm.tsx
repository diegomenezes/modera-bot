"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="space-y-3">
      <input
        name="current"
        type="password"
        className="field"
        placeholder="Senha atual"
        autoComplete="current-password"
        required
      />
      <input
        name="next"
        type="password"
        className="field"
        placeholder="Senha nova (mínimo 8 caracteres)"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <input
        name="confirm"
        type="password"
        className="field"
        placeholder="Repita a senha nova"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Salvando..." : "Trocar senha"}
      </button>
    </form>
  );
}
