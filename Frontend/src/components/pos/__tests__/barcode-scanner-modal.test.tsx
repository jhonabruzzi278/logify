import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BarcodeScannerModal } from "@/components/pos/barcode-scanner-modal";

const mockDecodeFromConstraints = vi.fn();
const mockDecodeFromVideoDevice = vi.fn();
const mockListVideoInputDevices = vi.fn();
const mockIsTorchCompatible = vi.fn();
const mockSetTorch = vi.fn();
const mockStop = vi.fn();

function makeFakeTrack(overrides: { getCapabilities?: () => object; getSettings?: () => object } = {}) {
  return {
    getCapabilities: vi.fn(overrides.getCapabilities ?? (() => ({}))),
    getSettings: vi.fn(overrides.getSettings ?? (() => ({ deviceId: "cam1" }))),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  };
}

let currentTrack = makeFakeTrack();

function attachStream(videoElem: HTMLVideoElement | undefined) {
  if (!videoElem) return;
  (videoElem as unknown as { srcObject: unknown }).srcObject = {
    getVideoTracks: () => [currentTrack],
  };
}

vi.mock("@zxing/browser", () => ({
  // vi.fn() con arrow function no puede usarse como constructor (new) --
  // BarcodeScannerModal hace `new BrowserMultiFormatReader()`, asi que el
  // mock necesita una function/class real.
  BrowserMultiFormatReader: vi.fn().mockImplementation(function BrowserMultiFormatReaderMock() {
    return {
      decodeFromConstraints: (...args: unknown[]) => mockDecodeFromConstraints(...args),
      decodeFromVideoDevice: (...args: unknown[]) => mockDecodeFromVideoDevice(...args),
    };
  }),
  BrowserCodeReader: {
    listVideoInputDevices: (...args: unknown[]) => mockListVideoInputDevices(...args),
    mediaStreamIsTorchCompatibleTrack: (...args: unknown[]) => mockIsTorchCompatible(...args),
    mediaStreamSetTorch: (...args: unknown[]) => mockSetTorch(...args),
  },
}));

describe("BarcodeScannerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTrack = makeFakeTrack();
    mockListVideoInputDevices.mockResolvedValue([]);
    mockIsTorchCompatible.mockReturnValue(false);
    mockSetTorch.mockResolvedValue(undefined);
    mockDecodeFromConstraints.mockImplementation(async (_constraints: unknown, videoElem: HTMLVideoElement | undefined) => {
      attachStream(videoElem);
      return { stop: mockStop };
    });
    mockDecodeFromVideoDevice.mockImplementation(async (_deviceId: string, videoElem: HTMLVideoElement | undefined) => {
      attachStream(videoElem);
      return { stop: mockStop };
    });
  });

  it("no muestra ningun control de camara cuando el dispositivo no reporta capacidades", async () => {
    render(<BarcodeScannerModal onDetected={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(mockListVideoInputDevices).toHaveBeenCalled());

    expect(screen.queryByRole("button", { name: /flash/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cambiar de cámara/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Zoom de la cámara")).not.toBeInTheDocument();
  });

  it("muestra el boton de flash cuando el track es compatible con torch, y lo activa al tocarlo", async () => {
    mockIsTorchCompatible.mockReturnValue(true);
    render(<BarcodeScannerModal onDetected={vi.fn()} onClose={vi.fn()} />);

    const torchButton = await screen.findByRole("button", { name: "Encender flash" });
    fireEvent.click(torchButton);

    await waitFor(() => expect(mockSetTorch).toHaveBeenCalledWith(currentTrack, true));
    expect(await screen.findByRole("button", { name: "Apagar flash" })).toBeInTheDocument();
  });

  it("muestra el slider de zoom cuando el track reporta capacidad de zoom, y aplica la constraint al mover", async () => {
    currentTrack = makeFakeTrack({
      getCapabilities: () => ({ zoom: { min: 1, max: 5, step: 0.5 } }),
      getSettings: () => ({ deviceId: "cam1", zoom: 1 }),
    });
    render(<BarcodeScannerModal onDetected={vi.fn()} onClose={vi.fn()} />);

    const slider = await screen.findByLabelText("Zoom de la cámara");
    fireEvent.change(slider, { target: { value: "3" } });

    await waitFor(() => expect(currentTrack.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 3 }] }));
  });

  it("oculta el boton de cambiar camara con un solo dispositivo disponible", async () => {
    mockListVideoInputDevices.mockResolvedValue([{ deviceId: "cam1", label: "Trasera" } as MediaDeviceInfo]);
    render(<BarcodeScannerModal onDetected={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(mockListVideoInputDevices).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /cambiar de cámara/i })).not.toBeInTheDocument();
  });

  it("muestra el boton de cambiar camara con 2+ dispositivos y reinicia la decodificacion con el siguiente deviceId", async () => {
    mockListVideoInputDevices.mockResolvedValue([
      { deviceId: "cam1", label: "Trasera" } as MediaDeviceInfo,
      { deviceId: "cam2", label: "Frontal" } as MediaDeviceInfo,
    ]);
    render(<BarcodeScannerModal onDetected={vi.fn()} onClose={vi.fn()} />);

    const switchButton = await screen.findByRole("button", { name: "Cambiar de cámara" });
    mockDecodeFromVideoDevice.mockClear();
    fireEvent.click(switchButton);

    await waitFor(() => expect(mockDecodeFromVideoDevice).toHaveBeenCalledWith("cam2", expect.anything(), expect.anything()));
  });

  it("mantiene el ingreso manual y el estado de error existentes", async () => {
    mockDecodeFromConstraints.mockRejectedValueOnce(new Error("permiso denegado"));
    const onDetected = vi.fn();
    render(<BarcodeScannerModal onDetected={onDetected} onClose={vi.fn()} />);

    expect(await screen.findByText(/no pudimos abrir la cámara/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ingresar código manualmente/i }));
    const input = screen.getByLabelText("Código de barras");
    fireEvent.change(input, { target: { value: "7801234567890" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(onDetected).toHaveBeenCalledWith("7801234567890");
  });
});
