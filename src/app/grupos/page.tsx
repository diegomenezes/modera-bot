import Link from "next/link";
import { requireWorkspace } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { ensureRedirectSlug, getRedirectGroups, redirectPath } from "@/lib/redirect";
import { GroupsForm, RefreshButton } from "./GroupsForm";
import { RedirectLink } from "./RedirectLink";

export default async function GruposPage() {
  const { workspace } = await requireWorkspace();
  const [instance, groups, settings] = await Promise.all([
    prisma.whatsappInstance.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.group.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ moderated: "desc" }, { name: "asc" }],
    }),
    prisma.moderationSettings.findUnique({ where: { workspaceId: workspace.id } }),
  ]);
  const connected = instance?.status === "open";
  const [slug, redirect] = await Promise.all([
    ensureRedirectSlug(workspace.id),
    getRedirectGroups(workspace.id),
  ]);
  const base = (process.env.APP_URL || process.env.BETTER_AUTH_URL || "").replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Grupos</h1>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          Marque os grupos que o bot vai moderar e escolha o grupo que recebe os
          avisos. O grupo de aviso pode ser um grupo só seu com o número do bot.
        </p>
      </section>

      {!connected ? (
        <section className="card space-y-3 p-5">
          <p>Conecte o WhatsApp do bot para ver os grupos.</p>
          <Link href="/whatsapp" className="btn btn-primary text-sm">
            Conectar WhatsApp
          </Link>
        </section>
      ) : (
        <>
          {groups.length > 0 && (
            <RedirectLink
              url={`${base}${redirectPath(slug)}`}
              rows={redirect.rows}
              totalVacancies={redirect.totalVacancies}
              usableCount={redirect.usable.length}
            />
          )}
          <RefreshButton hasGroups={groups.length > 0} />
          {groups.length > 0 && (
            <GroupsForm
              groups={groups.map((g) => ({
                remoteJid: g.remoteJid,
                name: g.name,
                size: g.size,
                botIsAdmin: g.botIsAdmin,
                moderated: g.moderated,
              }))}
              notifyGroupJid={settings?.notifyGroupJid ?? ""}
            />
          )}
        </>
      )}
    </div>
  );
}
