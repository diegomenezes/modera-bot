import Link from "next/link";
import { signOut } from "@/app/actions";
import { getSession, isAdmin } from "@/lib/dal";

export async function Header() {
  const session = await getSession();

  return (
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5">
      <Link href="/" className="flex items-center gap-2 text-xl font-semibold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={28} height={28} />
        Modera Bot
      </Link>
      {session && (
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/" className="nav-link">
            Painel
          </Link>
          {isAdmin(session) && (
            <Link href="/admin" className="nav-link">
              Admin
            </Link>
          )}
          <Link href="/conta" className="nav-link">
            Minha conta
          </Link>
          <form action={signOut}>
            <button type="submit" className="nav-link cursor-pointer">
              Sair
            </button>
          </form>
        </nav>
      )}
    </header>
  );
}
