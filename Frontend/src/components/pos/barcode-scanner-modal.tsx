import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { Barcode, Camera, Keyboard, RefreshCw, X } from "lucide-react";

interface BarcodeScannerModalProps {
  onDetected: (code: string) => void;
  onClose: () => void;
  title?: string;
}

export function BarcodeScannerModal({ onDetected, onClose, title = "Escanear producto" }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [manualCode, setManualCode] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | null = null;
    let cancelled = false;

    detectedRef.current = false;
    setError(null);

    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, videoRef.current ?? undefined, (result) => {
        if (result && !cancelled && !detectedRef.current) {
          detectedRef.current = true;
          navigator.vibrate?.(80);
          onDetected(result.getText().trim());
        }
      })
      .then((c) => { controls = c; })
      .catch(() => { if (!cancelled) setError("No pudimos abrir la cámara. Revisa el permiso del navegador o ingresa el código manualmente."); });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [cameraKey, onDetected]);

  function submitManualCode(event: React.FormEvent) {
    event.preventDefault();
    const code = manualCode.trim();
    if (code) onDetected(code);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#07111f] sm:items-center sm:bg-black/70 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="relative flex h-dvh w-full max-w-lg flex-col overflow-hidden bg-[#07111f] text-white sm:h-[min(760px,92vh)] sm:rounded-2xl sm:shadow-2xl">
        <div className="safe-top absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent px-4 pb-8 pt-4">
          <button type="button" onClick={onClose} aria-label="Cerrar escáner" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40 active:scale-95">
            <X className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-2 text-sm font-semibold backdrop-blur-sm">
            <Barcode className="h-4 w-4" /> {title}
          </div>
          <button type="button" onClick={() => setCameraKey((key) => key + 1)} aria-label="Reiniciar cámara" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40 active:scale-95">
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <video ref={videoRef} className="h-full w-full bg-black object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,17,31,.34),transparent_28%,transparent_68%,rgba(7,17,31,.65))]" />
          <div className="pointer-events-none absolute left-1/2 top-[46%] aspect-[1.65/1] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/80 shadow-[0_0_0_999px_rgba(7,17,31,.28)]">
            <span className="absolute -left-0.5 -top-0.5 h-9 w-9 rounded-tl-2xl border-l-4 border-t-4 border-[#38BDF8]" />
            <span className="absolute -right-0.5 -top-0.5 h-9 w-9 rounded-tr-2xl border-r-4 border-t-4 border-[#38BDF8]" />
            <span className="absolute -bottom-0.5 -left-0.5 h-9 w-9 rounded-bl-2xl border-b-4 border-l-4 border-[#38BDF8]" />
            <span className="absolute -bottom-0.5 -right-0.5 h-9 w-9 rounded-br-2xl border-b-4 border-r-4 border-[#38BDF8]" />
            {!error && <span className="barcode-scan-line absolute inset-x-4 top-1/2 h-0.5 bg-[#38BDF8] shadow-[0_0_12px_#38BDF8]" />}
          </div>
          <div className="absolute inset-x-6 top-[19%] text-center">
            <p className="text-base font-bold text-white drop-shadow-md">Mantén el código dentro del marco</p>
            <p className="mt-1 text-sm text-white/75">La lectura se realiza automáticamente</p>
          </div>

          {error && (
            <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 rounded-xl border border-white/15 bg-[#07111f]/90 p-5 text-center shadow-xl backdrop-blur-md">
              <Camera className="mx-auto h-8 w-8 text-[#38BDF8]" />
              <p className="mt-3 text-sm leading-relaxed text-white/85">{error}</p>
              <button type="button" onClick={() => setCameraKey((key) => key + 1)} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#172554]">Reintentar</button>
            </div>
          )}
        </div>

        <div className="safe-bottom z-20 border-t border-white/10 bg-[#07111f] px-5 pb-4 pt-4">
          {manualOpen ? (
            <form onSubmit={submitManualCode} className="flex gap-2">
              <label htmlFor="barcode-manual-input" className="sr-only">Código de barras</label>
              <input id="barcode-manual-input" autoFocus inputMode="numeric" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Escribe el código" className="h-12 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-4 text-base text-white outline-none placeholder:text-white/45 focus:border-[#38BDF8]" />
              <button type="submit" disabled={!manualCode.trim()} className="h-12 rounded-lg bg-[#2563EB] px-5 text-sm font-bold text-white disabled:opacity-40">Buscar</button>
            </form>
          ) : (
            <button type="button" onClick={() => setManualOpen(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/20 text-sm font-semibold text-white transition hover:bg-white/10">
              <Keyboard className="h-5 w-5" /> Ingresar código manualmente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
