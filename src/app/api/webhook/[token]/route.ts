import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseWebhook, processMessage } from "@/lib/moderation";

const WEBHOOK_MARK_MS = 60_000;
const lastMark = new Map<string, number>();

// Cada instância da Evolution tem um endereço próprio com um token secreto.
// Responde na hora e processa depois, para a Evolution não acumular atraso.
export async function POST(request: Request, ctx: RouteContext<"/api/webhook/[token]">) {
  const { token } = await ctx.params;
  const instance = await prisma.whatsappInstance.findUnique({
    where: { webhookToken: token },
    select: { id: true, name: true, status: true, workspaceId: true },
  });
  if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const event = String(body?.event ?? "").toLowerCase().replace("_", ".");

  after(async () => {
    // no máximo uma gravação por minuto por instância
    if (Date.now() - (lastMark.get(instance.id) ?? 0) > WEBHOOK_MARK_MS) {
      lastMark.set(instance.id, Date.now());
      await prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { lastWebhookAt: new Date() },
      });
    }
    if (event === "connection.update") {
      const state = (body?.data as { state?: string } | undefined)?.state;
      const status =
        state === "open" ? "open" : state === "connecting" ? "connecting" : "disconnected";
      if (state && status !== instance.status) {
        await prisma.whatsappInstance.update({ where: { id: instance.id }, data: { status } });
      }
      return;
    }

    const moderation = { workspaceId: instance.workspaceId, instance: instance.name };
    for (const message of parseWebhook(body)) {
      try {
        await processMessage(moderation, message);
      } catch (err) {
        console.error(`[moderacao] ${instance.workspaceId} processar mensagem:`, err);
      }
    }
  });

  return NextResponse.json({ ok: true });
}
