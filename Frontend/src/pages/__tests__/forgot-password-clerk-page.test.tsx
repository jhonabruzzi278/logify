import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ForgotPasswordClerkPage } from "@/pages/forgot-password-clerk-page";

const mockSignInCreate = vi.fn();
const mockAttemptFirstFactor = vi.fn();
const mockResetPassword = vi.fn();
const mockSetActive = vi.fn();
const mockUserReload = vi.fn().mockResolvedValue(undefined);

let clerkUser: { organizationMemberships: Array<{ organization: { id: string } }>; reload: typeof mockUserReload } = {
  organizationMemberships: [{ organization: { id: "org_1" } }],
  reload: mockUserReload,
};

vi.mock("@clerk/react", () => ({
  useClerk: () => ({ user: clerkUser }),
}));

vi.mock("@clerk/react/legacy", () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: mockSignInCreate,
      attemptFirstFactor: mockAttemptFirstFactor,
      resetPassword: mockResetPassword,
    },
    setActive: mockSetActive,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordClerkPage />
    </MemoryRouter>,
  );
}

describe("ForgotPasswordClerkPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserReload.mockResolvedValue(undefined);
    clerkUser = { organizationMemberships: [{ organization: { id: "org_1" } }], reload: mockUserReload };
  });

  it("completa el flujo correo -> codigo -> nueva contraseña y deja la sesion activa", async () => {
    mockSignInCreate.mockResolvedValue({ status: "needs_first_factor" });
    mockAttemptFirstFactor.mockResolvedValue({ status: "needs_new_password" });
    mockResetPassword.mockResolvedValue({ status: "complete", createdSessionId: "sess_1" });
    mockSetActive.mockResolvedValue(undefined);

    renderPage();

    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar código/i }));

    await screen.findByText(/revisa tu correo/i);
    expect(mockSignInCreate).toHaveBeenCalledWith({ strategy: "reset_password_email_code", identifier: "ana@example.com" });

    fireEvent.change(screen.getByPlaceholderText("Código de 6 dígitos"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verificar código/i }));

    await screen.findByText(/nueva contraseña/i);
    expect(mockAttemptFirstFactor).toHaveBeenCalledWith({ strategy: "reset_password_email_code", code: "123456" });

    fireEvent.change(screen.getByPlaceholderText("Contraseña nueva"), { target: { value: "Segura123!" } });
    fireEvent.change(screen.getByPlaceholderText("Confirma la contraseña nueva"), { target: { value: "Segura123!" } });
    fireEvent.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    await waitFor(() => expect(screen.getByText("Contraseña actualizada")).toBeInTheDocument());
    expect(mockResetPassword).toHaveBeenCalledWith({ password: "Segura123!" });
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_1" });
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_1", organization: "org_1" });
  });

  it("llega a 'done' aunque falle la activacion de la Organization (la sesion ya quedo activa)", async () => {
    mockSignInCreate.mockResolvedValue({ status: "needs_first_factor" });
    mockAttemptFirstFactor.mockResolvedValue({ status: "needs_new_password" });
    mockResetPassword.mockResolvedValue({ status: "complete", createdSessionId: "sess_1" });
    mockSetActive.mockResolvedValue(undefined);
    mockUserReload.mockRejectedValue(new Error("network hiccup"));

    renderPage();

    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar código/i }));
    await screen.findByText(/revisa tu correo/i);

    fireEvent.change(screen.getByPlaceholderText("Código de 6 dígitos"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verificar código/i }));
    await screen.findByText(/nueva contraseña/i);

    fireEvent.change(screen.getByPlaceholderText("Contraseña nueva"), { target: { value: "Segura123!" } });
    fireEvent.change(screen.getByPlaceholderText("Confirma la contraseña nueva"), { target: { value: "Segura123!" } });
    fireEvent.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    await waitFor(() => expect(screen.getByText("Contraseña actualizada")).toBeInTheDocument());
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_1" });
    expect(mockSetActive).not.toHaveBeenCalledWith({ session: "sess_1", organization: expect.any(String) });
  });

  it("muestra error si las contraseñas no coinciden, sin llamar a resetPassword", async () => {
    mockSignInCreate.mockResolvedValue({ status: "needs_first_factor" });
    mockAttemptFirstFactor.mockResolvedValue({ status: "needs_new_password" });

    renderPage();

    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar código/i }));
    await screen.findByText(/revisa tu correo/i);

    fireEvent.change(screen.getByPlaceholderText("Código de 6 dígitos"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verificar código/i }));
    await screen.findByText(/nueva contraseña/i);

    fireEvent.change(screen.getByPlaceholderText("Contraseña nueva"), { target: { value: "Segura123!" } });
    fireEvent.change(screen.getByPlaceholderText("Confirma la contraseña nueva"), { target: { value: "Otra456!" } });
    fireEvent.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    await screen.findByText("Las contraseñas no coinciden.");
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("muestra error cuando el codigo es invalido y no avanza de paso", async () => {
    mockSignInCreate.mockResolvedValue({ status: "needs_first_factor" });
    mockAttemptFirstFactor.mockResolvedValue({ status: "needs_first_factor" });

    renderPage();

    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar código/i }));
    await screen.findByText(/revisa tu correo/i);

    fireEvent.change(screen.getByPlaceholderText("Código de 6 dígitos"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verificar código/i }));

    await screen.findByText("El código no es válido o ya expiró.");
    expect(screen.queryByText(/^Nueva contraseña$/)).not.toBeInTheDocument();
  });
});
