import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { setBanned } from "./actions";
import { CreateClientForm, ResetPasswordForm } from "./forms";

export default async function AdminPage() {
  const session = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { memberships: { include: { workspace: true } } },
  });

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          Crie o acesso de cada cliente. Não existe cadastro pelo site: só entra quem
          você criar aqui.
        </p>
      </section>

      <section className="card max-w-xl space-y-3 p-5">
        <h2 className="font-semibold">Novo cliente</h2>
        <CreateClientForm />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Clientes ({users.length})</h2>
        {users.map((user) => {
          const self = user.id === session.user.id;
          const workspaces = user.memberships.map((m) => m.workspace.name).join(", ");
          return (
            <article key={user.id} className="card space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {user.name}{" "}
                    {user.role === "admin" && <span className="badge">admin</span>}{" "}
                    {user.banned && <span className="badge badge-warn">bloqueado</span>}
                  </p>
                  <p className="break-all text-sm text-[var(--ink-soft)]">{user.email}</p>
                  <p className="text-sm text-[var(--ink-soft)]">
                    Conta: {workspaces || "nenhuma"} · desde{" "}
                    {user.createdAt.toLocaleDateString("pt-BR")}
                  </p>
                </div>
                {!self && (
                  <form action={setBanned.bind(null, user.id, !user.banned)}>
                    <button
                      type="submit"
                      className={`btn text-sm ${user.banned ? "btn-secondary" : "btn-danger"}`}
                    >
                      {user.banned ? "Desbloquear" : "Bloquear acesso"}
                    </button>
                  </form>
                )}
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-[var(--ink-soft)]">
                  Redefinir senha
                </summary>
                <div className="mt-3 max-w-sm">
                  <ResetPasswordForm userId={user.id} />
                </div>
              </details>
            </article>
          );
        })}
      </section>
    </div>
  );
}
