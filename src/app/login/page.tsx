import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-8">
      <div className="card w-full max-w-md space-y-4 p-5 md:p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            Acesso
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Entrar no Modera Bot</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Use o e-mail e a senha que você recebeu do administrador.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
