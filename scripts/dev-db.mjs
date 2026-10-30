// Postgres embutido só para desenvolvimento. Em produção o banco é o Postgres da VPS.
import { existsSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

const dir = "./.pgdata";
const fresh = !existsSync(dir);

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password: "postgres",
  port: 5433,
  persistent: true,
  // sem isso o Windows cria o banco em WIN1252 e nomes de grupo com emoji quebram
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("modera");

console.log("Postgres de desenvolvimento rodando na porta 5433. Ctrl+C para parar.");

async function stop() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
