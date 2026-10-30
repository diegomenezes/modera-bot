import { requireUser } from "@/lib/dal";
import { PasswordForm } from "./PasswordForm";

export default async function ContaPage({ searchParams }: PageProps<"/conta">) {
  const session = await requireUser();
  const { senha } = await searchParams;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Minha conta</h1>
        <p className="mt-2 text-[var(--ink-soft)]">
          {session.user.name} · {session.user.email}
        </p>
      </section>
      <section className="card max-w-md space-y-3 p-5">
        <h2 className="font-semibold">Trocar senha</h2>
        {senha === "trocada" && (
          <p className="text-sm text-[var(--accent)]">
            Senha trocada. Outros aparelhos conectados foram desconectados.
          </p>
        )}
        <PasswordForm />
      </section>
    </div>
  );
}
