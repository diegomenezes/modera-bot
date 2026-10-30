"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="space-y-3">
      <input
        name="email"
        type="email"
        className="field"
        placeholder="E-mail"
        autoComplete="email"
        required
      />
      <input
        name="password"
        type="password"
        className="field"
        placeholder="Senha"
        autoComplete="current-password"
        required
      />
      {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
