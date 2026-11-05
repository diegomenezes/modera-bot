import { ConfirmButton } from "@/components/ConfirmButton";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { deleteClient, impersonate, setBanned } from "./actions";
import { CreateClientForm, ResetPasswordForm } from "./forms";

const STATUS_LABEL: Record<string, string> = {
  open: "WhatsApp conectado",
  connecting: "WhatsApp conectando",
  disconnected: "WhatsApp desconectado",
};

export default async function AdminPage() {
  await requireAdmin();
  const [users, instances] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ role: null }, { role: { not: "admin" } }] },
      orderBy: { createdAt: "desc" },
      include: {
        memberships: {
          include: {
            workspace: {
              include: {
                instance: true,
                settings: true,
                _count: { select: { groups: { where: { moderated: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.whatsappInstance.groupBy({ by: ["status"], _count: true }),
  ]);
  const connected = instances.find((i) => i.status === "open")?._count ?? 0;
  const total = instances.reduce((sum, i) => sum + i._count, 0);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          Crie o acesso de cada cliente. Não existe cadastro pelo site: só entra quem
          você criar aqui.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-[var(--ink-soft)]">Clientes</p>
          <p className="text-2xl font-semibold">{users.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--ink-soft)]">WhatsApp conectados</p>
          <p className="text-2xl font-semibold">{connected}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--ink-soft)]">Instâncias criadas</p>
          <p className="text-2xl font-semibold">{total}</p>
        </div>
      </section>

      <section className="card max-w-xl space-y-3 p-5">
        <h2 className="font-semibold">Novo cliente</h2>
        <CreateClientForm />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Clientes ({users.length})</h2>
        {users.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]">Nenhum cliente ainda.</p>
        )}
        {users.map((user) => {
          const workspace = user.memberships[0]?.workspace;
          const instance = workspace?.instance;
          const moderating = !!workspace?.settings?.enabled && workspace.active;
          return (
            <article key={user.id} className="card space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {user.name}{" "}
                    {user.banned && <span className="badge badge-warn">bloqueado</span>}
                  </p>
                  <p className="break-all text-sm text-[var(--ink-soft)]">{user.email}</p>
                  <p className="text-sm text-[var(--ink-soft)]">
                    Conta: {workspace?.name ?? "nenhuma"} · desde{" "}
                    {user.createdAt.toLocaleDateString("pt-BR")}
                  </p>
                  {workspace && (
                    <p className="mt-1 flex flex-wrap gap-2 text-sm">
                      <span className={`badge ${instance?.status === "open" ? "" : "badge-muted"}`}>
                        {instance ? (STATUS_LABEL[instance.status] ?? instance.status) : "sem WhatsApp"}
                        {instance?.phone ? ` · +${instance.phone}` : ""}
                      </span>
                      <span className="badge badge-muted">
                        {workspace._count.groups} grupo(s) moderado(s)
                      </span>
                      <span className={`badge ${moderating ? "" : "badge-muted"}`}>
                        {moderating ? "moderação ligada" : "moderação desligada"}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {workspace && !user.banned && (
                    <form action={impersonate.bind(null, user.id)}>
                      <button type="submit" className="btn btn-secondary text-sm">
                        Entrar como
                      </button>
                    </form>
                  )}
                  <form action={setBanned.bind(null, user.id, !user.banned)}>
                    <button
                      type="submit"
                      className={`btn text-sm ${user.banned ? "btn-secondary" : "btn-danger"}`}
                    >
                      {user.banned ? "Desbloquear" : "Bloquear acesso"}
                    </button>
                  </form>
                  <ConfirmButton
                    action={deleteClient.bind(null, user.id)}
                    message={`Excluir ${user.name}? A conta, o histórico e a conexão do WhatsApp dela serão apagados. Não dá para desfazer.`}
                    label="Excluir"
                  />
                </div>
              </div>
              <p className="text-sm text-[var(--ink-soft)]">
                Bloquear tira o acesso ao site e pausa a moderação dos grupos dela.
              </p>
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
