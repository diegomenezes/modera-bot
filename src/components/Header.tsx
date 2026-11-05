import Link from "next/link";
import { signOut, stopImpersonating } from "@/app/actions";
import { getSession, isAdmin } from "@/lib/dal";

export async function Header() {
  const session = await getSession();
  const impersonating = !!session?.session.impersonatedBy;

  return (
    <>
      {impersonating && session && (
        <div className="bg-[#b45309] text-[#fffbeb]">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
            <p>
              Você está vendo como <strong>{session.user.name}</strong> ({session.user.email}).
              O que você mudar aqui vale de verdade para essa conta.
            </p>
            <form action={stopImpersonating}>
              <button
                type="submit"
                className="rounded-full bg-[#fffbeb] px-3 py-1 font-semibold text-[#b45309]"
              >
                Voltar ao admin
              </button>
            </form>
          </div>
        </div>
      )}
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={28} height={28} />
          Modera Bot
        </Link>
        {session && (
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {isAdmin(session) ? (
              <>
                <Link href="/admin" className="nav-link">
                  Admin
                </Link>
                <Link href="/admin/relatorio" className="nav-link">
                  Relatório
                </Link>
                <Link href="/admin/atividade" className="nav-link">
                  Atividade
                </Link>
              </>
            ) : (
              <>
                <Link href="/" className="nav-link">
                  Painel
                </Link>
                <Link href="/whatsapp" className="nav-link">
                  WhatsApp
                </Link>
                <Link href="/grupos" className="nav-link">
                  Grupos
                </Link>
                <Link href="/regras" className="nav-link">
                  Regras
                </Link>
                <Link href="/alertas" className="nav-link">
                  Alertas
                </Link>
              </>
            )}
            <Link href="/conta" className="nav-link">
              Minha conta
            </Link>
            {!impersonating && (
              <form action={signOut}>
                <button type="submit" className="nav-link cursor-pointer">
                  Sair
                </button>
              </form>
            )}
          </nav>
        )}
      </header>
    </>
  );
}
