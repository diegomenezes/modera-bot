import "server-only";
import { prisma } from "./db";

// Passo a passo do primeiro acesso. Cada passo é marcado como feito pelos dados da conta,
// não por clique, então nunca fica "feito" sem estar feito de verdade.

export type OnboardingStep = {
  key: string;
  title: string;
  done: boolean;
  href: string | null;
  cta: string;
};

export async function getOnboarding(workspaceId: string) {
  const [workspace, instance, moderated, settings, blockedCount] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { onboardingDismissedAt: true, testedAt: true },
    }),
    prisma.whatsappInstance.findUnique({ where: { workspaceId }, select: { status: true } }),
    prisma.group.findMany({
      where: { workspaceId, moderated: true },
      select: { name: true, botIsAdmin: true },
    }),
    prisma.moderationSettings.findUnique({ where: { workspaceId } }),
    prisma.blockedDomain.count({ where: { workspaceId } }),
  ]);

  const connected = instance?.status === "open";
  const notAdmin = moderated.filter((g) => !g.botIsAdmin).map((g) => g.name);

  const steps: OnboardingStep[] = [
    { key: "whatsapp", title: "Conectar o WhatsApp do bot", done: connected, href: "/whatsapp", cta: "Conectar WhatsApp" },
    { key: "grupos", title: "Escolher os grupos moderados", done: moderated.length > 0, href: "/grupos", cta: "Escolher grupos" },
    { key: "aviso", title: "Escolher o grupo de aviso", done: !!settings?.notifyGroupJid, href: "/grupos", cta: "Escolher grupo de aviso" },
    { key: "admin", title: "Tornar o bot admin dos grupos", done: moderated.length > 0 && notAdmin.length === 0, href: "/grupos", cta: "Atualizar a lista de grupos" },
    { key: "teste", title: "Testar o aviso e o apagar", done: !!workspace?.testedAt, href: null, cta: "" },
    { key: "regras", title: "Conferir o que bloquear e liberar", done: blockedCount > 0, href: "/regras", cta: "Ver regras" },
    { key: "ligar", title: "Ligar a moderação", done: !!settings?.enabled, href: "/regras", cta: "Ligar a moderação" },
  ];

  const current = steps.findIndex((s) => !s.done);
  return {
    steps,
    notAdmin,
    current: current === -1 ? steps.length : current,
    complete: current === -1,
    dismissed: !!workspace?.onboardingDismissedAt,
    connected,
  };
}
