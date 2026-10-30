"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { checkStatus, startPairing, startQr, type ConnectResult } from "./actions";

type Mode = "idle" | "qr" | "code";

const QR_REFRESH_MS = 40_000;
const STATUS_POLL_MS = 3_000;

export function ConnectPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(result: ConnectResult, next: Mode) {
    if (result.error !== undefined) {
      setError(result.error);
      setMode("idle");
      return;
    }
    setError(null);
    setQr(result.qr);
    setPairingCode(result.pairingCode);
    setMode(next);
  }

  // enquanto mostra QR ou código, pergunta se já conectou
  useEffect(() => {
    if (mode === "idle") return;
    const timer = setInterval(async () => {
      const status = await checkStatus().catch(() => null);
      if (status?.status === "open") {
        clearInterval(timer);
        router.refresh();
      }
    }, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [mode, router]);

  // o QR do WhatsApp expira; gera outro sozinho
  useEffect(() => {
    if (mode !== "qr") return;
    const timer = setInterval(async () => {
      const result = await startQr();
      if (result.error === undefined && result.qr) setQr(result.qr);
    }, QR_REFRESH_MS);
    return () => clearInterval(timer);
  }, [mode]);

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span
          className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ${mode === "idle" ? "bg-[#dc2626]" : "bg-[#d97706]"}`}
          aria-hidden
        />
        <div>
          <p className="font-semibold">
            {mode === "idle" ? "Desconectado" : "Aguardando conexão"}
          </p>
          <p className="text-sm text-[var(--ink-soft)]">
            {mode === "idle"
              ? "Escolha como conectar o número do bot."
              : "Faça a leitura no celular do bot."}
          </p>
        </div>
      </div>

      {mode === "idle" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-[var(--line)] p-4">
            <p className="font-medium">QR code</p>
            <p className="text-sm text-[var(--ink-soft)]">
              Para quando o celular do bot está com você e você está no computador.
            </p>
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={pending}
              onClick={() => startTransition(async () => apply(await startQr(), "qr"))}
            >
              {pending ? "Gerando..." : "Gerar QR code"}
            </button>
          </div>
          <form
            className="space-y-2 rounded-xl border border-[var(--line)] p-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => apply(await startPairing(phone), "code"));
            }}
          >
            <p className="font-medium">Código no celular</p>
            <p className="text-sm text-[var(--ink-soft)]">
              Para quando você está no próprio celular do bot. Digite o número dele.
            </p>
            <input
              className="field"
              inputMode="tel"
              placeholder="11 91234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-secondary text-sm" disabled={pending}>
              {pending ? "Gerando..." : "Gerar código"}
            </button>
          </form>
        </div>
      )}

      {mode === "qr" && qr && (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR code para conectar o WhatsApp"
            className="h-64 w-64 rounded-xl border border-[var(--line)] bg-white p-2"
          />
          <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--ink-soft)]">
            <li>No celular do bot, abra o WhatsApp.</li>
            <li>Toque em Configurações (ou nos três pontinhos) → Dispositivos conectados.</li>
            <li>Toque em Conectar um dispositivo e aponte a câmera para o QR code.</li>
          </ol>
          <p className="text-sm text-[var(--ink-soft)]">
            O QR code se renova sozinho. Esta tela muda quando a conexão terminar.
          </p>
          <button type="button" className="btn btn-secondary text-sm" onClick={() => setMode("idle")}>
            Cancelar
          </button>
        </div>
      )}

      {mode === "code" && pairingCode && (
        <div className="space-y-3">
          <p className="font-mono text-3xl font-semibold tracking-[0.3em]">
            {pairingCode.replace(/^(.{4})(.{4})$/, "$1-$2")}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--ink-soft)]">
            <li>No celular do bot, abra o WhatsApp e toque na notificação que chegou.</li>
            <li>
              Ou vá em Dispositivos conectados → Conectar um dispositivo → Conectar com
              número de telefone.
            </li>
            <li>Digite o código acima.</li>
          </ol>
          <button type="button" className="btn btn-secondary text-sm" onClick={() => setMode("idle")}>
            Cancelar
          </button>
        </div>
      )}

      {error && <p className="text-sm text-[var(--warn)]">{error}</p>}
    </section>
  );
}
