"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/dal";

export type FormState = { error?: string; ok?: string } | undefined;

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await auth.api.signInEmail({
      body: { email: text(form, "email").toLowerCase(), password: text(form, "password") },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError) {
      const message = String(err.body?.message ?? "");
      return {
        error: /banned|bloquead/i.test(message)
          ? "Seu acesso está bloqueado. Fale com o administrador."
          : "E-mail ou senha incorretos.",
      };
    }
    throw err;
  }
  redirect("/");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function changePassword(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  await requireUser();
  const currentPassword = text(form, "current");
  const newPassword = text(form, "next");
  if (newPassword.length < 8) {
    return { error: "A senha nova precisa de pelo menos 8 caracteres." };
  }
  if (newPassword !== text(form, "confirm")) {
    return { error: "A confirmação não bate com a senha nova." };
  }
  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError) return { error: "Senha atual incorreta." };
    throw err;
  }
  // A sessão foi renovada. Redirecionar faz a próxima tela já usar o cookie novo.
  redirect("/conta?senha=trocada");
}
