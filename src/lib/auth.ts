import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { prisma } from "./db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Só o admin cria contas. Não existe cadastro pelo site.
    disableSignUp: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
  },
  plugins: [
    admin({
      // "Entrar como" no Admin: a sessão como cliente vale 1 hora
      impersonationSessionDuration: 60 * 60,
      bannedUserMessage: "Seu acesso está bloqueado. Fale com o administrador.",
    }),
    // precisa ser o último: grava o cookie quando o login acontece numa Server Action
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
