import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginClerkPage } from "@/pages/login-clerk-page";

vi.mock("@clerk/react", () => ({
  SignIn: () => <div data-testid="clerk-sign-in" />,
}));

describe("LoginClerkPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("muestra un mensaje de diagnostico cuando Clerk no esta configurado", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");

    render(<LoginClerkPage />);

    expect(screen.getByText("Clerk no está configurado en este entorno.")).toBeInTheDocument();
    expect(screen.queryByTestId("clerk-sign-in")).not.toBeInTheDocument();
  });

  it("renderiza el SignIn de Clerk cuando esta configurado", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "fake-publishable-key-for-tests");

    render(<LoginClerkPage />);

    expect(screen.getByTestId("clerk-sign-in")).toBeInTheDocument();
    expect(screen.queryByText("Clerk no está configurado en este entorno.")).not.toBeInTheDocument();
  });
});
