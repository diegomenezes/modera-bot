import Link from "next/link";
import { redirect } from "next/navigation";
import { reopenOnboarding } from "@/app/comecar/actions";
import { requireWorkspace } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getOnboarding } from "@/lib/onboarding";
import { refreshStatus } from "@/lib/whatsapp";

export default async function PainelPage({ searchParams }: PageProps<"/">) {
  const { session, workspace } = await requireWorkspace();
  const onboarding = await getOnboarding(workspace.id);
  // primeiro acesso: vai direto para o passo a passo (o cliente pode fechar)
  if (!onboarding.dismissed && !onboarding.complete) redirect("/comecar");
  const { passo } = await searchParams;
  const [status, moderatedCount, settings, unknownCount] = await Promise.all([
    refreshStatus(workspace.id).catch(() => null),
    prisma.group.count({ where: { workspaceId: workspace.id, moderated: true } }),
    prisma.moderationSettings.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.unknownLink.count({ where: { workspaceId: workspace.id } }),
  ]);
  const connected = status?.status === "open";
  const dropped = !!status && status.status !== "open" && status.status !== "none";
  const groupsReady = moderatedCount > 0 && !!settings?.notifyGroupJid;
  const moderating = connected && groupsReady && !!settings?.enabled;

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
      title: "Definir as regras e ligar a moderação",
      detail: moderating
        ? settings?.deleteMode
          ? "Moderação ligada, apagando links bloqueados."
          : "Moderação ligada, só avisando (modo apagar desligado)."
        : "Quais sites bloquear, quais liberar, e ligar a moderação.",
      done: moderating,
      href: groupsReady ? "/regras" : null,
      action: moderating ? "Ajustar" : "Configurar",
    },
  ];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-[var(--ink-soft)]">Olá, {session.user.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{workspace.name}</h1>
      </section>

      {!onboarding.complete && (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-semibold">Passo a passo</p>
            <p className="text-sm text-[var(--ink-soft)]">
              {passo === "fechado" ? "Passo a passo fechado. " : ""}
              {onboarding.steps.filter((s) => s.done).length} de {onboarding.steps.length} passos
              feitos. Próximo: {onboarding.steps[onboarding.current]?.title}.
            </p>
          </div>
          <form action={reopenOnboarding}>
            <button type="submit" className="btn btn-primary text-sm">
              Abrir passo a passo
            </button>
          </form>
        </section>
      )}

      {dropped && (
        <section
          className="card flex flex-wrap items-center justify-between gap-3 p-5"
          style={{ background: "#fef2f2", borderColor: "rgba(185, 28, 28, 0.35)" }}
        >
          <div>
            <p className="font-semibold text-[#b91c1c]">WhatsApp desconectado</p>
            <p className="text-sm text-[var(--ink-soft)]">
              Enquanto estiver assim, o bot não modera os grupos. Conecte de novo.
            </p>
          </div>
          <Link href="/whatsapp" className="btn btn-primary text-sm">
            Conectar
          </Link>
        </section>
      )}

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
                <p className="font-medium">{step.title}</p>
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

      {unknownCount > 0 && (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm">
            {unknownCount} link(s) não identificado(s) esperando você decidir.
          </p>
          <Link href="/alertas" className="btn btn-secondary text-sm">
            Ver alertas
          </Link>
        </section>
      )}
    </div>
  );
}
