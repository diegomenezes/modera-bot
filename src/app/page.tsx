import { requireWorkspace } from "@/lib/dal";

const STEPS = [
  {
    title: "Conectar seu WhatsApp",
    detail: "Escaneie um QR code ou digite um código no celular.",
  },
  {
    title: "Escolher os grupos",
    detail: "Marque os grupos que o bot vai moderar e o grupo que recebe os avisos.",
  },
  {
    title: "Definir as regras",
    detail: "Quais sites bloquear, quais liberar e a mensagem que sai depois de apagar.",
  },
];

export default async function PainelPage() {
  const { session, workspace } = await requireWorkspace();

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-[var(--ink-soft)]">Olá, {session.user.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{workspace.name}</h1>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Primeiros passos</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Estas etapas ficam disponíveis nas próximas atualizações.
          </p>
        </div>
        <ol className="space-y-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="badge badge-muted h-7 w-7 shrink-0 justify-center p-0">
                {index + 1}
              </span>
              <div>
                <p className="font-medium">
                  {step.title} <span className="badge badge-muted ml-1">em breve</span>
                </p>
                <p className="text-sm text-[var(--ink-soft)]">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
