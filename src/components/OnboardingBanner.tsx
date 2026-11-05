"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Lembrete do passo a passo em todas as telas do cliente, menos no próprio passo a passo.
export function OnboardingBanner({
  step,
  title,
  total,
}: {
  step: number;
  title: string;
  total: number;
}) {
  const pathname = usePathname();
  if (pathname === "/comecar") return null;

  return (
    <div className="bg-[var(--accent-soft)]">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
        <p>
          Passo {step} de {total}: <strong>{title}</strong>
        </p>
        <Link href="/comecar" className="font-semibold text-[var(--accent)] underline">
          Voltar ao passo a passo
        </Link>
      </div>
    </div>
  );
}
