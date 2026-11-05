import Link from "next/link";
import type { ReactNode } from "react";
import { TestAlertButton } from "@/app/regras/forms";
import { requireWorkspace } from "@/lib/dal";
import { getOnboarding } from "@/lib/onboarding";
import { closeOnboarding } from "./actions";

export const dynamic = "force-dynamic";

function explain(key: string, notAdmin: string[]): ReactNode {
  switch (key) {
    case "whatsapp":
      return (
        <>
          <p>
            O bot usa um número de WhatsApp que participa dos seus grupos. Prefira um número
            só para isso, num celular que fica com internet.
          </p>
          <p>
            Na tela WhatsApp, gere o QR code e leia no celular do bot: WhatsApp → três
            pontinhos ou Configurações → Dispositivos conectados → Conectar um dispositivo.
          </p>
        </>
      );
    case "grupos":
      return (
        <p>
          Na tela Grupos, toque em <strong>Buscar meus grupos</strong>, marque os grupos que o
          bot deve vigiar e toque em <strong>Salvar</strong>. O número do bot precisa
          participar desses grupos.
        </p>
      );
    case "aviso":
      return (
        <p>
          É o grupo para onde o bot manda os alertas (quem mandou link, qual link, se apagou).
          Pode ser um grupo só seu com o número do bot. Escolha na mesma tela Grupos, no topo,
          e salve.
        </p>
      );
    case "admin":
      return (
        <>
          <p>
            Sem ser admin, o bot só consegue avisar, não apagar. Em cada grupo moderado: abra o
            grupo no WhatsApp → toque no nome do grupo → Participantes → toque no número do bot
            → <strong>Tornar admin do grupo</strong>.
          </p>
          {notAdmin.length > 0 && (
            <p className="text-[var(--warn)]">Ainda falta em: {notAdmin.join(", ")}.</p>
          )}
          <p>Depois, na tela Grupos, toque em <strong>Atualizar lista</strong>.</p>
        </>
      );
    case "teste":
      return (
        <>
          <p>
            Confirme que está tudo ligado. <strong>Mandar teste</strong> envia uma mensagem no
            grupo de aviso. <strong>Testar apagar</strong> manda uma frase lá, apaga para
            todos e manda a mensagem pós-exclusão.
          </p>
          <TestAlertButton />
        </>
      );
    case "regras":
      return (
        <p>
          Na tela Regras ficam os sites bloqueados (o link é apagado) e os liberados (passam
          direto). Link de site que não está em nenhuma lista não é apagado: só chega um
          aviso para você decidir em Alertas. Links que admins do grupo mandam ficam
          liberados por 72 horas.
        </p>
      );
    case "ligar":
      return (
        <p>
          Em Regras, marque <strong>Moderação ligada</strong> e salve. Dica: comece com
          &quot;Apagar a mensagem&quot; desmarcado por um dia, só recebendo os avisos, para ver
          se as regras estão do jeito que você quer. Depois ligue o apagar.
        </p>
      );
    default:
      return null;
  }
}

export default async function ComecarPage() {
  const { workspace } = await requireWorkspace();
  const { steps, current, complete, notAdmin } = await getOnboarding(workspace.id);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--ink-soft)]">Passo a passo</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {complete ? "Tudo pronto!" : "Vamos deixar o bot funcionando"}
          </h1>
          <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
            {complete
              ? "O bot está vigiando os seus grupos. Os alertas chegam no grupo de aviso e ficam na tela Alertas."
              : `${doneCount} de ${steps.length} passos feitos. Cada passo é marcado sozinho quando você conclui.`}
          </p>
        </div>
        <form action={closeOnboarding}>
          <button type="submit" className="btn btn-secondary text-sm">
            {complete ? "Concluir" : "Fechar passo a passo"}
          </button>
        </form>
      </section>

      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--line)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => {
          const open = index === current;
          return (
            <li
              key={step.key}
              className="card p-5"
              style={open ? { borderColor: "var(--accent)", borderWidth: 2 } : undefined}
            >
              <details open={open}>
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span
                    className={`badge h-7 w-7 shrink-0 justify-center p-0 ${step.done ? "" : "badge-muted"}`}
                  >
                    {step.done ? "✓" : index + 1}
                  </span>
                  <span className={`font-medium ${step.done ? "text-[var(--ink-soft)]" : ""}`}>
                    {step.title}
                  </span>
                  {open && <span className="badge ml-auto shrink-0">agora</span>}
                </summary>
                <div className="mt-3 space-y-3 pl-10 text-sm">
                  {explain(step.key, notAdmin)}
                  {step.href && (
                    <Link
                      href={step.href}
                      className={`btn text-sm ${step.done ? "btn-secondary" : "btn-primary"}`}
                    >
                      {step.cta}
                    </Link>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>

      <p className="text-sm text-[var(--ink-soft)]">
        Pode fechar e voltar quando quiser: enquanto não terminar, uma faixa no topo mostra o
        próximo passo. Depois de fechar, abra de novo pelo Painel.
      </p>
    </div>
  );
}
