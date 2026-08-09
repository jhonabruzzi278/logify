import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WorkspacePortalPage } from "@/pages/workspace-portal-page";

describe("WorkspacePortalPage", () => {
  it("explica que el acceso requiere identificar la empresa", () => {
    render(<WorkspacePortalPage />);
    expect(screen.getByRole("heading", { name: "Ir a mi espacio de trabajo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Espacio de trabajo")).toBeInTheDocument();
  });

  it("rechaza un espacio de trabajo inválido sin navegar", () => {
    render(<WorkspacePortalPage />);
    fireEvent.change(screen.getByLabelText("Espacio de trabajo"), { target: { value: "empresa inválida" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar al login/i }));
    expect(screen.getByText(/ingresa el subdominio de tu empresa/i)).toBeInTheDocument();
  });

  it("adapta el flujo para recuperación", () => {
    render(<WorkspacePortalPage destination="/forgot-password" />);
    expect(screen.getByRole("heading", { name: "Recuperar acceso" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuar recuperación/i })).toBeInTheDocument();
  });
});
