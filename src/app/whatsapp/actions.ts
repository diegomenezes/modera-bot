"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/dal";
import {
  disconnect,
  normalizePhone,
  refreshStatus,
  startConnection,
  type ConnectionStatus,
} from "@/lib/whatsapp";

export type ConnectResult =
  | { qr: string | null; pairingCode: string | null; error?: undefined }
  | { error: string };

export async function startQr(): Promise<ConnectResult> {
  const { workspace } = await requireWorkspace();
  try {
    const result = await startConnection(workspace.id);
    if (!result.qr) return { error: "A Evolution não devolveu o QR code. Tente de novo." };
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function startPairing(rawPhone: string): Promise<ConnectResult> {
  const { workspace } = await requireWorkspace();
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "Digite o número com DDD, por exemplo 11 91234-5678." };
  try {
    const result = await startConnection(workspace.id, phone);
    if (!result.pairingCode) {
      return { error: "A Evolution não devolveu o código. Tente pelo QR code." };
    }
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkStatus(): Promise<ConnectionStatus> {
  const { workspace } = await requireWorkspace();
  return refreshStatus(workspace.id);
}

export async function disconnectWhatsapp() {
  const { workspace } = await requireWorkspace();
  await disconnect(workspace.id);
  revalidatePath("/whatsapp");
  revalidatePath("/");
}
