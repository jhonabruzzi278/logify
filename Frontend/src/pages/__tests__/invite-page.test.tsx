import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { InvitePage } from "@/pages/invite-page";

const mockAcceptInvite = vi.fn();

vi.mock("@/lib/local-jwt-auth", () => ({
  acceptInvite: (...args: unknown[]) => mockAcceptInvite(...args),
}));

function renderInvitePage(token = "tok123") {
  return render(
    <MemoryRouter initialEntries={[`/invite/${token}`]}>
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/login" element={<div>Pagina de login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function acceptInvite() {
  fireEvent.change(screen.getByPlaceholderText("Tu nombre"), { target: { value: "Ana Soto" } });
  fireEvent.change(screen.getByPlaceholderText("nombre.usuario"), { target: { value: "ana.soto" } });
  fireEvent.change(screen.getByPlaceholderText("Contraseña"), { target: { value: "Segura123!" } });
  fireEvent.change(screen.getByPlaceholderText("Confirma la contraseña"), { target: { value: "Segura123!" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
  await waitFor(() => expect(screen.getByText("Cuenta creada")).toBeInTheDocument());
}

describe("InvitePage", () => {
  beforeEach(() => {
    mockAcceptInvite.mockReset();
  });

  it("navega al subdominio del tenant legado después de crear la cuenta", async () => {
    mockAcceptInvite.mockResolvedValue({ tenantSlug: "lapercha" });
    const assignMock = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignMock });

    renderInvitePage();
    await acceptInvite();
    fireEvent.click(screen.getByRole("button", { name: /ir a iniciar sesión/i }));

    expect(assignMock).toHaveBeenCalledWith("https://lapercha.logify.cl/login");
    vi.unstubAllGlobals();
  });

  it("usa la URL de inicio de sesión entregada por el backend", async () => {
    mockAcceptInvite.mockResolvedValue({ tenantSlug: "logify", loginUrl: "https://app.logify.cl/login" });
    const assignMock = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignMock });

    renderInvitePage();
    await acceptInvite();

    expect(() => fireEvent.click(screen.getByRole("button", { name: /ir a iniciar sesión/i }))).not.toThrow();
    expect(assignMock).toHaveBeenCalledWith("https://app.logify.cl/login");
    vi.unstubAllGlobals();
  });
});
