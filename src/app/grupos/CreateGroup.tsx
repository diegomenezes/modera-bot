"use client";

import { useActionState, useState, useTransition } from "react";
import type { NewGroupDraft, SeriesInfo } from "@/lib/groupCreate";
import { submitWithoutReset } from "@/lib/form";
import { createGroupAction, loadGroupDraft, type CreateGroupState } from "./actions";

// Reduz a foto no navegador: a ação do servidor aceita no máximo 1 MB.
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const size = Math.min(640, side);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Não consegui ler a imagem."));
      // corta no centro, quadrado
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Arquivo não é uma imagem."));
    img.src = url;
  });
}

export function CreateGroup({ series }: { series: SeriesInfo[] }) {
  // guarda o resultado que existia ao abrir: um resultado novo com sucesso fecha o painel
  const [opened, setOpened] = useState<{ at: CreateGroupState } | null>(null);
  const [chosenJid, setChosenJid] = useState("");
  const [draft, setDraft] = useState<NewGroupDraft | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, startLoading] = useTransition();
  const [picture, setPicture] = useState("");
  const [state, action, pending] = useActionState(createGroupAction, undefined);

  // depois de criar, a série muda (o #8 vira o último): cai na primeira opção válida
  const sourceJid = series.some((s) => s.lastJid === chosenJid)
    ? chosenJid
    : (series[0]?.lastJid ?? "");
  const open = opened !== null && !(state?.ok && state !== opened.at);

  function load(jid: string) {
    setChosenJid(jid);
    setDraft(null);
    setLoadError("");
    setPicture("");
    if (!jid) return;
    startLoading(async () => {
      const res = await loadGroupDraft(jid);
      if (res.error) setLoadError(res.error);
      else if (res.draft) setDraft(res.draft);
    });
  }

  function openPanel() {
    setOpened({ at: state });
    load(sourceJid);
  }

  const result = state?.ok ? state : null;

  if (!open) {
    return (
      <div className="space-y-3">
        <button type="button" className="btn btn-primary text-sm" onClick={openPanel}>
          Criar grupo
        </button>
        {result && (
          <section className="card space-y-2 p-5 text-sm">
            <p className="font-semibold text-[var(--accent)]">{result.ok}</p>
            <ul className="list-disc space-y-1 pl-5">
              {result.done?.map((line) => <li key={line}>{line}</li>)}
              {result.failed?.map((line) => (
                <li key={line} className="text-[var(--warn)]">{line}</li>
              ))}
            </ul>
            <ApprovalTip />
          </section>
        )}
      </div>
    );
  }

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Criar grupo</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Cria o próximo grupo da série, com a descrição, os admins e a foto do último.
          </p>
        </div>
        <button type="button" className="btn btn-secondary text-sm" onClick={() => setOpened(null)}>
          Fechar
        </button>
      </div>

      {series.length === 0 ? (
        <p className="text-sm text-[var(--warn)]">
          Nenhum grupo com nome terminando em #número (ex.: Primeiras Impressões 3D #7). Dê
          esse nome a um grupo no WhatsApp e toque em Atualizar lista.
        </p>
      ) : (
        <form onSubmit={submitWithoutReset(action)} className="space-y-4">
          <input type="hidden" name="source" value={sourceJid} />
          <input type="hidden" name="picture" value={picture} />

          {series.length > 1 && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Copiar de</span>
              <select className="field" value={sourceJid} onChange={(e) => load(e.target.value)}>
                {series.map((s) => (
                  <option key={s.lastJid} value={s.lastJid}>
                    {s.lastName}
                  </option>
                ))}
              </select>
            </label>
          )}

          {loading && <p className="text-sm text-[var(--ink-soft)]">Lendo o grupo...</p>}
          {loadError && <p className="text-sm text-[var(--warn)]">{loadError}</p>}

          {draft && (
            <>
              <p>
                <span className="text-sm text-[var(--ink-soft)]">Novo grupo</span>
                <br />
                <strong className="text-xl">{draft.nextName}</strong>
              </p>

              <label className="block space-y-1">
                <span className="text-sm font-medium">Descrição</span>
                <textarea
                  key={draft.sourceJid}
                  name="description"
                  className="field min-h-40"
                  defaultValue={draft.description}
                  maxLength={2048}
                />
                <span className="block text-sm text-[var(--ink-soft)]">
                  O link de convite de {draft.sourceName} na descrição vira o link do grupo novo.
                </span>
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium">Admins (um número por linha, com DDD)</span>
                <textarea
                  key={`admins-${draft.sourceJid}`}
                  name="admins"
                  className="field min-h-24"
                  defaultValue={draft.admins.join("\n")}
                  placeholder={"19999998888\n19999997777\n19999996666"}
                />
                <span className="block text-sm text-[var(--ink-soft)]">
                  Veio dos admins de {draft.sourceName}. O número do bot entra sozinho como criador.
                </span>
              </label>

              <div className="space-y-2">
                <span className="text-sm font-medium">Foto do grupo</span>
                <div className="flex flex-wrap items-center gap-4">
                  {(picture || draft.pictureUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={picture || draft.pictureUrl!}
                      alt="Foto do grupo"
                      className="h-20 w-20 rounded-full object-cover"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="text-sm"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return setPicture("");
                      try {
                        setPicture(await resizeImage(file));
                      } catch (err) {
                        setLoadError(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  />
                </div>
                <span className="block text-sm text-[var(--ink-soft)]">
                  {draft.pictureUrl
                    ? `Sem escolher outra, usa a foto de ${draft.sourceName}.`
                    : `${draft.sourceName} não tem foto. Escolha uma, se quiser.`}
                </span>
              </div>

              <ApprovalTip />

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {pending ? "Criando..." : `Criar ${draft.nextName}`}
                </button>
                {state?.error && <p className="text-sm text-[var(--warn)]">{state.error}</p>}
              </div>
            </>
          )}
        </form>
      )}
    </section>
  );
}

function ApprovalTip() {
  return (
    <p className="text-sm text-[var(--ink-soft)]">
      Só admins mudam os dados do grupo: isso o bot liga sozinho. Aprovar a entrada de novos
      membros a Evolution não deixa ligar pelo bot: no celular, abra o grupo → Configurações do
      grupo → ligue <strong>Aprovar novos participantes</strong>.
    </p>
  );
}
