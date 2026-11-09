import { after } from "next/server";
import { pickGroup, recountIfIdle } from "@/lib/redirect";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function page(status: number, title: string, text: string) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f6f7f5;color:#1c2421;padding:16px}
main{max-width:420px;text-align:center}h1{font-size:1.4rem;margin:0 0 .5rem}p{color:#5b6661;line-height:1.5;margin:0}</style>
</head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE },
  });
}

// Destino público do link /grupo-<slug> (o proxy reescreve para cá).
export async function GET(_request: Request, ctx: RouteContext<"/r/[slug]">) {
  const { slug } = await ctx.params;
  const result = await pickGroup(slug.toLowerCase());

  if (result.kind === "not-found") {
    return page(404, "Link não encontrado", "Confira se o endereço está certo.");
  }
  if (result.kind === "unavailable") {
    return page(503, "Link indisponível", "Este link está pausado no momento.");
  }
  if (result.needsRecount) after(() => recountIfIdle(result.workspaceId));
  if (result.kind === "full" || !result.url) {
    return page(
      503,
      "Grupos cheios",
      "Todos os grupos estão lotados agora. Tente de novo mais tarde.",
    );
  }
  return new Response(null, { status: 302, headers: { Location: result.url, ...NO_STORE } });
}
