// Cria o primeiro admin (o cadastro pelo site é desligado).
// Uso: npm run admin:create -- <email> <senha> "<nome>" ["<nome da conta>"]
import "dotenv/config";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/db";

async function main() {
  const [rawEmail, password, name, workspaceName] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !password || !name) {
    console.error('Uso: npm run admin:create -- <email> <senha> "<nome>" ["<nome da conta>"]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("A senha precisa de pelo menos 8 caracteres.");
    process.exit(1);
  }

  const ctx = await auth.$context;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { role: "admin" } });
    console.log(`${email} já existia e agora é admin. A senha não foi alterada.`);
    return;
  }

  const user = await ctx.internalAdapter.createUser(
    { email, name, role: "admin", emailVerified: true },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  await prisma.workspace.create({
    data: {
      name: workspaceName || name,
      memberships: { create: { userId: user.id, role: "owner" } },
    },
  });
  console.log(`Admin ${email} criado com a conta "${workspaceName || name}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
