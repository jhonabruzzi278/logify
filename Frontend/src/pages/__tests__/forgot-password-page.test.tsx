import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForgotPasswordPage } from "@/pages/forgot-password-page";

vi.mock("@/pages/forgot-password-clerk-page", () => ({
  ForgotPasswordClerkPage: () => <div>flujo-clerk</div>,
}));
vi.mock("@/pages/forgot-password-legacy-page", () => ({
  ForgotPasswordLegacyPage: () => <div>flujo-legacy</div>,
}));
vi.mock("@/pages/workspace-portal-page", () => ({
  WorkspacePortalPage: () => <div>buscador-de-espacio</div>,
}));

function setHostname(hostname: string) {
  vi.stubGlobal("location", { ...window.location, hostname });
}

describe("ForgotPasswordPage (router por host)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("muestra el flujo de Clerk en app.logify.cl cuando Clerk esta activo", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");
    setHostname("app.logify.cl");

    render(<ForgotPasswordPage />);
    expect(screen.getByText("flujo-clerk")).toBeInTheDocument();
  });

  it("muestra el buscador de espacio de trabajo en app.logify.cl cuando Clerk NO esta activo", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    setHostname("app.logify.cl");

    render(<ForgotPasswordPage />);
    expect(screen.getByText("buscador-de-espacio")).toBeInTheDocument();
  });

  it("muestra el flujo legacy en el subdominio de un tenant no migrado, aunque Clerk este activo globalmente", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");
    setHostname("minimarketelsol.logify.cl");

    render(<ForgotPasswordPage />);
    expect(screen.getByText("flujo-legacy")).toBeInTheDocument();
  });
});
