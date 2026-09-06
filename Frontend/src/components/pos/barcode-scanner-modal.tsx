import { useEffect, useRef, useState } from "react";
import { BrowserCodeReader, BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import type { Result } from "@zxing/library";
import { Barcode, Camera, Flashlight, Keyboard, RefreshCw, SwitchCamera, X } from "lucide-react";

interface BarcodeScannerModalProps {
  onDetected: (code: string) => void;
  onClose: () => void;
  title?: string;
}

// Sin hints, BrowserMultiFormatReader activa TODOS los lectores en cada frame
// (QR, DataMatrix, Aztec, PDF417 ademas de codigos de barras 1D) -- formatos
// que este negocio nunca usa, y que le restan FPS efectivos al lector de
// barras real. Se restringe a los formatos que de verdad circulan (barras de
// retail + QR por si un proveedor lo usa) y se activa TRY_HARDER para 1D:
// hace pasadas mas completas por frame (mas costo de CPU, mejor tasa de
// deteccion en barras borrosas/inclinadas), razonable en un escaneo continuo.
const SCAN_HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
    ],
  ],
  [DecodeHintType.TRY_HARDER, true],
]);

// Sin width/height explicitos, getUserMedia puede entregar una resolucion
// baja segun el dispositivo -- un EAN-13 necesita suficientes pixeles
// horizontales para resolver el ancho de cada barra, mas critico aun de
// cerca. "ideal" nunca falla si el hardware no llega a esto, solo pide lo
// maximo razonable.
const VIDEO_RESOLUTION_CONSTRAINTS = { width: { ideal: 1920 }, height: { ideal: 1080 } };

// El Image Capture API (zoom, torch, focusMode/focusDistance) es un borrador
// experimental -- lib.dom.d.ts no lo tipa todavia, asi que se extiende
// localmente en vez de usar `any`.
interface ExtendedTrackCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step: number };
}

interface ExtendedTrackSettings extends MediaTrackSettings {
  zoom?: number;
}

interface ExtendedConstraintSet extends MediaTrackConstraintSet {
  zoom?: number;
  focusMode?: string;
  focusDistance?: number;
}

export function BarcodeScannerModal({ onDetected, onClose, title = "Escanear producto" }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  // deviceId real de la camara activa, incluso antes de que la persona elija
  // una explicitamente con el boton de cambiar camara (el primer stream se
  // abre por facingMode, no por deviceId) -- switchCamera() lo necesita para
  // calcular cual es "la siguiente" a partir de la que esta en uso ahora.
  const currentDeviceIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [manualCode, setManualCode] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoomValue, setZoomValue] = useState<number | null>(null);
  const [focusSupported, setFocusSupported] = useState(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader(SCAN_HINTS);
    let controls: IScannerControls | null = null;
    let cancelled = false;

    detectedRef.current = false;
    setError(null);
    setTorchOn(false);
    setTorchSupported(false);
    setZoomCaps(null);
    setZoomValue(null);
    setFocusSupported(false);
    trackRef.current = null;
    currentDeviceIdRef.current = null;

    function handleResult(result: Result | undefined) {
      if (result && !cancelled && !detectedRef.current) {
        detectedRef.current = true;
        navigator.vibrate?.(80);
        onDetected(result.getText().trim());
      }
    }

    // decodeFromVideoDevice() arma sus propias constraints internamente
    // (solo deviceId, sin resolucion) -- se usa siempre decodeFromConstraints
    // directamente para poder pedir alta resolucion tambien al cambiar de
    // camara, no solo en la apertura inicial.
    const videoConstraints: MediaTrackConstraints = activeDeviceId
      ? { deviceId: { exact: activeDeviceId }, ...VIDEO_RESOLUTION_CONSTRAINTS }
      : { facingMode: { ideal: "environment" }, ...VIDEO_RESOLUTION_CONSTRAINTS };

    const decodePromise = reader.decodeFromConstraints(
      { video: videoConstraints, audio: false },
      videoRef.current ?? undefined,
      handleResult
    );

    decodePromise
      .then((c) => {
        controls = c;
        if (cancelled) return;

        const stream = videoRef.current?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0] ?? null;
        trackRef.current = track;

        if (track && typeof track.getCapabilities === "function") {
          const caps = track.getCapabilities() as ExtendedTrackCapabilities;
          const settings = track.getSettings() as ExtendedTrackSettings;
          currentDeviceIdRef.current = settings.deviceId ?? activeDeviceId;
          setTorchSupported(BrowserCodeReader.mediaStreamIsTorchCompatibleTrack(track));
          if (caps.zoom) {
            setZoomCaps(caps.zoom);
            setZoomValue(settings.zoom ?? caps.zoom.min);
          }
          setFocusSupported(Array.isArray(caps.focusMode) && caps.focusMode.includes("manual"));
        }

        // Recien despues de un getUserMedia exitoso: sin permiso ya concedido,
        // enumerateDevices() devuelve dispositivos sin label en la mayoria de
        // navegadores -- inutil para armar un selector con nombres reales.
        BrowserCodeReader.listVideoInputDevices()
          .then((list) => { if (!cancelled) setDevices(list); })
          .catch(() => {});
      })
      .catch(() => { if (!cancelled) setError("No pudimos abrir la cámara. Revisa el permiso del navegador o ingresa el código manualmente."); });

    return () => {
      cancelled = true;
      controls?.stop();
      trackRef.current = null;
    };
  }, [cameraKey, activeDeviceId, onDetected]);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      await BrowserCodeReader.mediaStreamSetTorch(track, !torchOn);
      setTorchOn((value) => !value);
    } catch {
      // El navegador reporto soporte pero rechazo la constraint en la practica
      // (comun en iOS Safari) -- se oculta el control en vez de insistir.
      setTorchSupported(false);
    }
  }

  async function handleZoomChange(value: number) {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as ExtendedConstraintSet] });
      setZoomValue(value);
    } catch {
      // Sin cambios visibles si el navegador rechaza la constraint en runtime.
    }
  }

  async function handleFocusTap() {
    const track = trackRef.current;
    if (!track) return;
    try {
      const caps = track.getCapabilities() as ExtendedTrackCapabilities;
      const distance = caps.focusDistance;
      const midpoint = distance ? (distance.min + distance.max) / 2 : undefined;
      await track.applyConstraints({ advanced: [{ focusMode: "manual", focusDistance: midpoint } as ExtendedConstraintSet] });
    } catch {
      // Mejor esfuerzo: un solo intento, sin feedback de error para no
      // distraer el flujo de escaneo por una capacidad secundaria.
    }
  }

  function switchCamera() {
    if (devices.length < 2) return;
    const currentId = currentDeviceIdRef.current ?? activeDeviceId;
    const currentIndex = devices.findIndex((device) => device.deviceId === currentId);
    const next = devices[(currentIndex + 1) % devices.length];
    setActiveDeviceId(next.deviceId);
  }

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
          <div className="flex items-center gap-2">
            {torchSupported && (
              <button type="button" onClick={toggleTorch} aria-label={torchOn ? "Apagar flash" : "Encender flash"} aria-pressed={torchOn} className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition active:scale-95 ${torchOn ? "bg-[#38BDF8] text-[#07111f]" : "bg-black/25 text-white hover:bg-black/40"}`}>
                <Flashlight className="h-5 w-5" />
              </button>
            )}
            {devices.length > 1 && (
              <button type="button" onClick={switchCamera} aria-label="Cambiar de cámara" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40 active:scale-95">
                <SwitchCamera className="h-5 w-5" />
              </button>
            )}
            <button type="button" onClick={() => setCameraKey((key) => key + 1)} aria-label="Reiniciar cámara" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40 active:scale-95">
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <video ref={videoRef} className="h-full w-full bg-black object-cover" muted playsInline onClick={focusSupported ? handleFocusTap : undefined} />
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
            <p className="mt-1 text-sm text-white/75">{focusSupported ? "Toca la imagen para enfocar" : "La lectura se realiza automáticamente"}</p>
          </div>

          {zoomCaps && zoomValue !== null && (
            <div className="absolute inset-x-10 bottom-6 flex items-center gap-3 rounded-full bg-black/35 px-4 py-2 backdrop-blur-sm">
              <span className="text-xs font-semibold text-white/80">Zoom</span>
              <input
                type="range"
                aria-label="Zoom de la cámara"
                min={zoomCaps.min}
                max={zoomCaps.max}
                step={zoomCaps.step}
                value={zoomValue}
                onChange={(event) => handleZoomChange(Number(event.target.value))}
                className="h-1.5 w-full accent-[#38BDF8]"
              />
            </div>
          )}

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
