import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClerkAuthProvider } from "@/app/clerk-provider";

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children, publishableKey }: { children: React.ReactNode; publishableKey: string }) => (
    <div data-testid="clerk-provider" data-publishable-key={publishableKey}>
      {children}
    </div>
  ),
}));

describe("ClerkAuthProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renderiza los children directamente, sin ClerkProvider, cuando la clave no esta configurada", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");

    render(
      <ClerkAuthProvider>
        <span>contenido</span>
      </ClerkAuthProvider>,
    );

    expect(screen.getByText("contenido")).toBeInTheDocument();
    expect(screen.queryByTestId("clerk-provider")).not.toBeInTheDocument();
  });

  it("envuelve los children en ClerkProvider con la publishable key cuando esta configurada", async () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_abc123");

    render(
      <ClerkAuthProvider>
        <span>contenido</span>
      </ClerkAuthProvider>,
    );

    const provider = await screen.findByTestId("clerk-provider");
    expect(provider).toHaveAttribute("data-publishable-key", "pk_test_abc123");
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});
