import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ForgotPasswordLegacyPage } from "@/pages/forgot-password-legacy-page";

const mockGetSecretQuestion = vi.fn();
const mockVerifySecretAnswer = vi.fn();
const mockResetPasswordWithToken = vi.fn();

vi.mock("@/lib/security-service", () => ({
  getSecretQuestion: (...args: unknown[]) => mockGetSecretQuestion(...args),
  verifySecretAnswer: (...args: unknown[]) => mockVerifySecretAnswer(...args),
  resetPasswordWithToken: (...args: unknown[]) => mockResetPasswordWithToken(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/forgot-password"]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordLegacyPage />} />
        <Route path="/login" element={<div>Pagina de login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ForgotPasswordLegacyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completa el flujo usuario -> pregunta -> respuesta -> nueva contraseña", async () => {
    mockGetSecretQuestion.mockResolvedValue("¿Cuál es tu color favorito?");
    mockVerifySecretAnswer.mockResolvedValue("reset-token-abc");
    mockResetPasswordWithToken.mockResolvedValue(undefined);

    renderPage();

    fireEvent.change(screen.getByPlaceholderText("nombre.usuario"), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByText("¿Cuál es tu color favorito?");
    expect(mockGetSecretQuestion).toHaveBeenCalledWith("admin");

    fireEvent.change(screen.getByPlaceholderText("Tu respuesta"), { target: { value: "azul" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar respuesta" }));

    await screen.findByText(/nueva contraseña/i);
    expect(mockVerifySecretAnswer).toHaveBeenCalledWith("admin", "azul");

    fireEvent.change(screen.getByPlaceholderText("Contraseña nueva"), { target: { value: "Segura123!" } });
    fireEvent.change(screen.getByPlaceholderText("Confirma la contraseña nueva"), { target: { value: "Segura123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    await waitFor(() => expect(screen.getByText("Contraseña actualizada")).toBeInTheDocument());
    expect(mockResetPasswordWithToken).toHaveBeenCalledWith("reset-token-abc", "Segura123!", "Segura123!");

    fireEvent.click(screen.getByRole("button", { name: /ir a iniciar sesión/i }));
    expect(await screen.findByText("Pagina de login")).toBeInTheDocument();
  });

  it("muestra error si el usuario no existe, sin avanzar de paso", async () => {
    mockGetSecretQuestion.mockRejectedValue(new Error("Usuario no encontrado"));

    renderPage();

    fireEvent.change(screen.getByPlaceholderText("nombre.usuario"), { target: { value: "no-existe" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByText("Usuario no encontrado");
    expect(screen.queryByRole("heading", { name: "Pregunta secreta" })).not.toBeInTheDocument();
  });

  it("muestra error si la respuesta secreta es incorrecta", async () => {
    mockGetSecretQuestion.mockResolvedValue("¿Cuál es tu color favorito?");
    mockVerifySecretAnswer.mockRejectedValue(new Error("Respuesta secreta incorrecta."));

    renderPage();

    fireEvent.change(screen.getByPlaceholderText("nombre.usuario"), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("¿Cuál es tu color favorito?");

    fireEvent.change(screen.getByPlaceholderText("Tu respuesta"), { target: { value: "incorrecta" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar respuesta" }));

    await screen.findByText("Respuesta secreta incorrecta.");
    expect(mockResetPasswordWithToken).not.toHaveBeenCalled();
  });
});
