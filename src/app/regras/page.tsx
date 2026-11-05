import Link from "next/link";
import { requireWorkspace } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { ensureSettings } from "@/lib/moderation";
import { addAllowed, addBlocked, addInvite, removeRule } from "./actions";
import { AddItemForm, SettingsForm, TestAlertButton } from "./forms";

export default async function RegrasPage() {
  const { workspace } = await requireWorkspace();
  const settings = await ensureSettings(workspace.id);
  const where = { workspaceId: workspace.id };
  const [blocked, allowed, invites, moderatedCount] = await Promise.all([
    prisma.blockedDomain.findMany({ where, orderBy: { domain: "asc" } }),
    prisma.allowedDomain.findMany({ where, orderBy: { domain: "asc" } }),
    prisma.allowedInvite.findMany({ where, orderBy: { createdAt: "desc" } }),
    prisma.group.count({ where: { ...where, moderated: true } }),
  ]);

  const lists = [
    {
      kind: "blocked" as const,
      title: "Domínios bloqueados",
      help: "Link destes sites é apagado (com o modo apagar ligado) e avisado. Vale para os subdomínios.",
      placeholder: "ex.: shopee.com.br",
      add: addBlocked,
      items: blocked.map((b) => ({ id: b.id, label: b.domain })),
      empty: "Nenhum domínio bloqueado.",
    },
    {
      kind: "allowed" as const,
      title: "Domínios liberados",
      help: "Links destes sites passam direto, sem aviso. youtube.com libera também m.youtube.com.",
      placeholder: "ex.: youtube.com",
      add: addAllowed,
      items: allowed.map((a) => ({ id: a.id, label: a.domain })),
      empty: "Nenhum domínio liberado.",
    },
    {
      kind: "invite" as const,
      title: "Convites de grupo autorizados",
      help: "Links chat.whatsapp.com que podem ser divulgados, mesmo com convites bloqueados.",
      placeholder: "https://chat.whatsapp.com/...",
      add: addInvite,
      items: invites.map((i) => ({ id: i.id, label: i.url })),
      empty: "Nenhum convite autorizado.",
    },
  ];

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Regras</h1>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          Link de site que não está em nenhuma lista não é apagado: só gera um aviso no
          grupo de aviso e aparece em{" "}
          <Link href="/alertas" className="underline">
            Alertas
          </Link>{" "}
          para você decidir. Links que admins do grupo mandam ficam liberados por 72 horas.
        </p>
      </section>

      {moderatedCount === 0 && (
        <section className="card p-5 text-sm">
          Nenhum grupo moderado ainda.{" "}
          <Link href="/grupos" className="underline">
            Escolha os grupos
          </Link>{" "}
          antes de ligar a moderação.
        </section>
      )}

      <section className="card space-y-4 p-5">
        <SettingsForm
          enabled={settings.enabled}
          deleteMode={settings.deleteMode}
          announceDelete={settings.announceDelete}
          announceText={settings.announceText}
        />
        <TestAlertButton />
      </section>

      {lists.map((list) => (
        <section key={list.kind} className="card space-y-3 p-5">
          <div>
            <h2 className="font-semibold">{list.title}</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{list.help}</p>
          </div>
          <AddItemForm
            action={list.add}
            name={list.kind === "invite" ? "url" : "domain"}
            placeholder={list.placeholder}
          />
          <ul className="space-y-2 text-sm">
            {list.items.length === 0 && (
              <li className="text-[var(--ink-soft)]">{list.empty}</li>
            )}
            {list.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span className="break-all">{item.label}</span>
                <form action={removeRule.bind(null, list.kind, item.id)}>
                  <button type="submit" className="btn btn-danger shrink-0 text-sm">
                    Remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
