import Link from "next/link";
import { requireWorkspace } from "@/lib/dal";
import { refreshStatus } from "@/lib/whatsapp";
import { disconnectWhatsapp } from "./actions";
import { ConnectPanel } from "./ConnectPanel";

function formatPhone(phone: string) {
  const m = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${phone}`;
}

export default async function WhatsappPage() {
  const { workspace } = await requireWorkspace();
  const status = await refreshStatus(workspace.id).catch(() => null);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          O bot usa um número de WhatsApp que participa dos seus grupos. Para apagar
          mensagens, esse número precisa ser admin do grupo.
        </p>
      </section>

      {status?.status === "open" ? (
        <section className="card space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span
              className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full bg-[var(--accent)]"
              aria-hidden
            />
            <div>
              <p className="font-semibold">Conectado</p>
              <p className="text-sm text-[var(--ink-soft)]">
                {status.profileName ? `${status.profileName} · ` : ""}
                {status.phone ? formatPhone(status.phone) : "número não identificado"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/grupos" className="btn btn-primary text-sm">
              Escolher grupos
            </Link>
            <form action={disconnectWhatsapp}>
              <button type="submit" className="btn btn-danger text-sm">
                Desconectar
              </button>
            </form>
          </div>
        </section>
      ) : (
        <ConnectPanel />
      )}

      <section className="card space-y-2 p-5 text-sm text-[var(--ink-soft)]">
        <p className="font-semibold text-[var(--ink)]">Antes de conectar</p>
        <p>
          Prefira um número secundário, só para o bot. O Modera Bot usa uma conexão não
          oficial do WhatsApp, e números usados assim podem ser bloqueados pelo WhatsApp.
        </p>
        <p>
          O celular desse número precisa continuar com internet. Se ele ficar muito
          tempo desligado, a conexão cai e é preciso conectar de novo.
        </p>
      </section>
    </div>
  );
}
