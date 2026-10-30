import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { prisma } from "./db";

// Única porta de entrada para saber quem está logado e de qual conta são os dados.
// Toda consulta de dados de cliente usa o workspace devolvido por requireWorkspace().

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export const requireUser = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
});

export function isAdmin(session: { user: { role?: string | null } }) {
  return session.user.role === "admin";
}

export const requireAdmin = cache(async () => {
  const session = await requireUser();
  if (!isAdmin(session)) redirect("/");
  return session;
});

export const requireWorkspace = cache(async () => {
  const session = await requireUser();
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect(isAdmin(session) ? "/admin" : "/sem-conta");
  return {
    session,
    workspace: membership.workspace,
    role: membership.role,
  };
});
