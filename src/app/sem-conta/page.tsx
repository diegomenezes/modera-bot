import { requireUser } from "@/lib/dal";

export default async function SemContaPage() {
  await requireUser();

  return (
    <div className="card mx-auto mt-10 max-w-md space-y-2 p-6">
      <h1 className="text-xl font-semibold">Seu acesso ainda não está pronto</h1>
      <p className="text-sm text-[var(--ink-soft)]">
        Seu login existe, mas ainda não foi ligado a uma conta. Fale com o administrador.
      </p>
    </div>
  );
}
