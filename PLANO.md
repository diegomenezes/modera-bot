# Modera Bot — plano e contexto

Sistema de moderação de grupos de WhatsApp, separado do gerador de reels
(`c:\Projetos\gerador-reels`), para vender acesso a amigos e conhecidos.
Cada cliente tem login próprio, conecta o próprio número e escolhe os próprios grupos.

## Origem

A moderação nasceu dentro do gerador de reels. O motor está em
`gerador-reels/src/lib/moderation.ts` e `gerador-reels/src/lib/evolution.ts` e deve ser
reaproveitado, adaptado para várias contas. Funciona assim hoje:

- A Evolution manda `MESSAGES_UPSERT` para o webhook; o app responde na hora e processa em `after()`.
- Link de domínio bloqueado: apaga para todos, avisa no grupo (marcando a pessoa) e manda alerta no grupo de aviso.
- Link de domínio desconhecido (fora de bloqueados e liberados): só alerta no grupo de aviso, uma vez por domínio,
  e aparece no painel com os botões "Adicionar à whitelist" e "Bloquear".
- Admins do grupo e o próprio número ficam de fora; links que o admin manda ficam liberados por 72 horas.
- Convites `chat.whatsapp.com` podem ser autorizados um a um.
- Exclusão que falha entra numa fila (1, 2, 5, 10, 30, 60, 120, 240 min, até 24 h); depois disso manda "APAGUE À MÃO".
- Mensagens presas em "pending" (processo caiu no meio) são retomadas pela fila.

## Fatos descobertos (não óbvios)

- **Causa das falhas de apagar:** 100% dos erros eram `Connection Closed` da Evolution — o socket do
  WhatsApp cai com a sessão aparecendo "open". Solução atual: `POST /instance/restart/{instância}`
  (no máximo 1x a cada 5 min), esperar `connectionState` = open e tentar de novo.
- **A Evolution não guarda mensagens** desses grupos (`findMessages` devolve total 0). Não dá para varrer
  histórico nem confirmar se a mensagem sumiu. O webhook é a única fonte.
- **O gerador de reels depende do webhook da moderação:** o pipeline lê a tabela `Message`
  (`gerador-reels/src/lib/pipeline.ts`), que só é gravada pelo webhook da instância `Diego`.
  **Decisão (05/11/2026):** o mesmo número (5519990253244) fica conectado em duas instâncias —
  `Diego` alimenta o gerador e `mb-d33b8ea6d30b` alimenta o Modera Bot. Não há repasse entre sistemas.
  Na troca: desligar "Moderação ligada" no gerador e ligar no Modera Bot ao mesmo tempo, nunca os dois.
- Evolution v2.3.7 em `api.designcreator.cloud`. `/instance/fetchInstances` devolve `ownerJid`.
  `/group/fetchAllGroups/{inst}?getParticipants=true` lista grupos com `admin` de cada participante.
- `POST /settings/set` na 2.3.7 exige todos os campos (`rejectCall`, `alwaysOnline`, `readMessages`, `readStatus`).

## Infra (VPS `LeilaoMagico`, IP 72.62.106.196)

- Traefik em Docker Swarm (`traefik_traefik`), rede `LeilaoMagicoNet`, Let's Encrypt via `letsencryptresolver`.
  Só lê serviços do Swarm (sem arquivo de configuração).
- Apps fora do Docker (PM2) são publicados com uma stack de Nginx que repassa para
  `host.docker.internal:<porta>`. Ex.: `/root/reels.yaml` + `/root/reels-nginx.conf` → porta 3010.
- Modera Bot: `modera.designcreator.cloud` → stack `modera` (nginx) → PM2 porta **3020**. Arquivos em `deploy/`.
- O Postgres do Swarm (`postgres_postgres`) não publica porta, e mexer nele derruba n8n/typebot. O Modera Bot
  tem um Postgres próprio: contêiner `modera-postgres` (postgres:17-alpine, volume `modera_pgdata`),
  ouvindo só em `127.0.0.1:5433`.
- Gerador de reels fica em `/opt/gerador-reels`; o Modera Bot vai em `/opt/modera-bot`.

## Decisões

- Stack igual ao gerador: Next.js 16.3.8, Prisma 6.19, Tailwind 4. Postgres no lugar de SQLite.
- Login com Better Auth (e-mail e senha) + plugin admin. **Sem cadastro aberto:** só o admin cria contas.
- Modelo: `User` (Better Auth) → `Membership` → `Workspace` (a "conta" do cliente; não chamar de
  Account porque a Better Auth já usa esse nome). Todo dado de moderação pertence a um `Workspace`.
- Toda leitura/escrita passa por `src/lib/dal.ts`, que resolve usuário e workspace. Nenhuma tela consulta
  o banco sem o filtro do workspace — o pior erro possível é um cliente ver dados de outro.
- Uma instância da Evolution por workspace. Webhook por instância com token próprio (`/api/webhook/{token}`).
- LGPD: gravar só as mensagens sinalizadas (não todas) e apagar histórico depois de um prazo.
- Avisar o cliente que a Evolution não é API oficial e que é melhor usar um número secundário.

## Fases

1. **Base** — login, workspace, Postgres, painel admin (criar, bloquear, redefinir senha). ✓
2. **Conexão** — criar instância, QR e código de pareamento, lista de grupos com indicação de admin,
   escolher grupo de aviso sem digitar ID, webhook por instância. ✓ (código de pareamento ainda não
   testado com número real: só pedir código para número do próprio usuário)
3. **Moderação** — portar o motor para workspaces; migrar os dados do Diego como primeiro workspace;
   repasse de mensagens para o gerador.
4. **Desligar** a moderação do gerador de reels.
5. **Teste com 2–3 amigos.**
6. **Cobrança** — Pix manual liberado pelo admin; depois assinatura (Asaas ou Mercado Pago).

## Notas da fase 2

- Instância na Evolution: `mb-<hex>`; webhook `APP_URL/api/webhook/<token>` com `MESSAGES_UPSERT` e `CONNECTION_UPDATE`.
- Código de pareamento: a Evolution só devolve quando a instância nasce com `number`; por isso o fluxo
  apaga e recria a instância.
- Admin do grupo: compara o telefone do `ownerJid` com `id`/`phoneNumber`/`jid` dos participantes.
- Nunca testar apontando para a instância `Diego` pela tela WhatsApp: `refreshStatus` pode
  reconfigurar o webhook e derrubar a moderação do gerador.

## Pendências do Diego

- Criar o repositório vazio `modera-bot` no GitHub.
- DNS: registro A `modera` → `72.62.106.196` (na fase de deploy).
- Mandar o conteúdo de `/root/reels-nginx.conf` para copiar os mesmos ajustes.
- Decidir preço e limites (por número, por grupo ou fixo).
