import Link from "next/link";
import { requireWorkspace } from "@/lib/dal";
import { prisma } from "@/lib/db";

export default async function PainelPage() {
  const { session, workspace } = await requireWorkspace();
  const [instance, moderatedCount, settings] = await Promise.all([
    prisma.whatsappInstance.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.group.count({ where: { workspaceId: workspace.id, moderated: true } }),
    prisma.moderationSettings.findUnique({ where: { workspaceId: workspace.id } }),
  ]);
  const connected = instance?.status === "open";
  const groupsReady = moderatedCount > 0 && !!settings?.notifyGroupJid;

  const steps = [
    {
      title: "Conectar seu WhatsApp",
      detail: connected
        ? "Conectado."
        : "Escaneie um QR code ou digite um código no celular do bot.",
      done: connected,
      href: "/whatsapp",
      action: connected ? "Ver conexão" : "Conectar",
    },
    {
      title: "Escolher os grupos",
      detail: groupsReady
        ? `${moderatedCount} grupo(s) moderado(s) e grupo de aviso escolhido.`
        : "Marque os grupos que o bot vai moderar e o grupo que recebe os avisos.",
      done: groupsReady,
      href: connected ? "/grupos" : null,
      action: groupsReady ? "Alterar" : "Escolher",
    },
    {
      title: "Definir as regras",
      detail: "Quais sites bloquear, quais liberar e a mensagem que sai depois de apagar.",
      done: false,
      href: null,
      action: "",
      soon: true,
    },
  ];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-[var(--ink-soft)]">Olá, {session.user.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{workspace.name}</h1>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Primeiros passos</h2>
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-wrap items-start gap-3">
              <span
                className={`badge h-7 w-7 shrink-0 justify-center p-0 ${step.done ? "" : "badge-muted"}`}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {step.title}{" "}
                  {step.soon && <span className="badge badge-muted ml-1">em breve</span>}
                </p>
                <p className="text-sm text-[var(--ink-soft)]">{step.detail}</p>
              </div>
              {step.href && (
                <Link
                  href={step.href}
                  className={`btn text-sm ${step.done ? "btn-secondary" : "btn-primary"}`}
                >
                  {step.action}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
