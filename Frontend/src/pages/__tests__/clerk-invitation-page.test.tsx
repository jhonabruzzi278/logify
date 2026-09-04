import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ClerkInvitationPage } from "@/pages/clerk-invitation-page";

vi.mock("@clerk/react", () => ({
  SignUp: () => <div>Formulario Clerk de registro</div>,
  SignIn: () => <div>Formulario Clerk de acceso</div>,
}));

vi.mock("@/lib/clerk-config", () => ({
  isClerkConfigured: () => true,
}));

function renderPage(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/accept-invitation${search}`]}>
      <Routes>
        <Route path="/accept-invitation" element={<ClerkInvitationPage />} />
        <Route path="/dashboard" element={<p>Panel principal</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClerkInvitationPage", () => {
  it("muestra el registro cuando la persona invitada todavía no tiene cuenta", () => {
    renderPage("?__clerk_ticket=ticket_123&__clerk_status=sign_up");

    expect(screen.getByText("Formulario Clerk de registro")).toBeInTheDocument();
    expect(screen.getByText(/rol asignado por el administrador/i)).toBeInTheDocument();
  });

  it("muestra el acceso cuando la persona invitada ya tiene cuenta", () => {
    renderPage("?__clerk_ticket=ticket_123&__clerk_status=sign_in");

    expect(screen.getByText("Formulario Clerk de acceso")).toBeInTheDocument();
  });

  it("rechaza una URL sin ticket de invitación", () => {
    renderPage("");

    expect(screen.getByRole("heading", { name: "Invitación no válida" })).toBeInTheDocument();
  });
});
