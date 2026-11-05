"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function closeOnboarding() {
  const { workspace } = await requireWorkspace();
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { onboardingDismissedAt: new Date() },
  });
  revalidatePath("/", "layout");
  redirect("/?passo=fechado");
}

export async function reopenOnboarding() {
  const { workspace } = await requireWorkspace();
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { onboardingDismissedAt: null },
  });
  revalidatePath("/", "layout");
  redirect("/comecar");
}
