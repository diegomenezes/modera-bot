"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { FormState } from "@/app/actions";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { deleteInstance } from "@/lib/evolution";

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function apiMessage(err: unknown, fallback: string) {
  if (err instanceof APIError) {
    const message = String(err.body?.message ?? "");
    if (/already exists|already in use/i.test(message)) {
      return "Já existe um usuário com esse e-mail.";
    }
    return message || fallback;
  }
  throw err;
}

export async function createClient(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  await requireAdmin();
  const name = text(form, "name");
  const email = text(form, "email").toLowerCase();
  const password = text(form, "password");
  const workspaceName = text(form, "workspace") || name;

  if (!name || !email) return { error: "Preencha nome e e-mail." };
  if (password.length < 8) {
    return { error: "A senha provisória precisa de pelo menos 8 caracteres." };
  }

  let userId: string;
  try {
    const created = await auth.api.createUser({
      body: { name, email, password, role: "user" },
      headers: await headers(),
    });
    userId = created.user.id;
  } catch (err) {
    return { error: apiMessage(err, "Não consegui criar o usuário.") };
  }

  try {
    await prisma.workspace.create({
      data: {
        name: workspaceName,
        memberships: { create: { userId, role: "owner" } },
      },
    });
  } catch (err) {
    // sem conta o login não serve para nada: desfaz para poder tentar de novo
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    throw err;
  }

  revalidatePath("/admin");
  return { ok: `${name} criado. Envie o e-mail e a senha provisória para a pessoa.` };
}

export async function setBanned(userId: string, banned: boolean) {
  const session = await requireAdmin();
  if (userId === session.user.id) return;
  const requestHeaders = await headers();
  if (banned) {
    await auth.api.banUser({
      body: { userId, banReason: "Bloqueado pelo administrador" },
      headers: requestHeaders,
    });
  } else {
    await auth.api.unbanUser({ body: { userId }, headers: requestHeaders });
  }
  // bloqueado também deixa de ser moderado (ex.: falta de pagamento)
  await prisma.workspace.updateMany({
    where: { memberships: { some: { userId } } },
    data: { active: !banned },
  });
  revalidatePath("/admin");
}

// Apaga o cliente, a conta e a instância dele na Evolution, para não sobrar número ligado.
export async function deleteClient(userId: string) {
  const session = await requireAdmin();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { workspace: { include: { instance: true, _count: { select: { memberships: true } } } } },
      },
    },
  });
  if (!user || user.id === session.user.id || user.role === "admin") return;

  for (const { workspace } of user.memberships) {
    // conta com outra pessoa continua existindo; só sai este usuário
    if (workspace._count.memberships > 1) continue;
    if (workspace.instance) await deleteInstance(workspace.instance.name);
    await prisma.workspace.delete({ where: { id: workspace.id } });
  }
  await prisma.user.delete({ where: { id: user.id } });
  revalidatePath("/admin");
}

export async function resetPassword(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  await requireAdmin();
  const userId = text(form, "userId");
  const newPassword = text(form, "password");
  if (newPassword.length < 8) {
    return { error: "A senha precisa de pelo menos 8 caracteres." };
  }
  const requestHeaders = await headers();
  try {
    await auth.api.setUserPassword({
      body: { userId, newPassword },
      headers: requestHeaders,
    });
    await auth.api.revokeUserSessions({ body: { userId }, headers: requestHeaders });
  } catch (err) {
    return { error: apiMessage(err, "Não consegui trocar a senha.") };
  }
  return { ok: "Senha trocada. A pessoa precisa entrar de novo." };
}

// Entra no sistema como o cliente, para ver e ajustar o que ele vê. Volta pela faixa do topo.
export async function impersonate(userId: string) {
  const session = await requireAdmin();
  await auth.api.impersonateUser({ body: { userId }, headers: await headers() });
  console.log(`[admin] ${session.user.email} entrou como ${userId}`);
  redirect("/");
}
