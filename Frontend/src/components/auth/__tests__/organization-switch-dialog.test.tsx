import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrganizationSwitchDialog } from "@/components/auth/organization-switch-dialog";

const OPTIONS = [
  { id: "org_1", name: "Empresa Uno", slug: "empresa-uno" },
  { id: "org_2", name: "Empresa Dos", slug: "empresa-dos" },
];

describe("OrganizationSwitchDialog", () => {
  it("muestra un boton por cada organizacion y marca la activa como actual", () => {
    render(
      <OrganizationSwitchDialog
        open
        onOpenChange={vi.fn()}
        options={OPTIONS}
        loading={false}
        busy={false}
        error={null}
        currentSlug="empresa-uno"
        onSelect={vi.fn()}
      />
    );

    const currentButton = screen.getByRole("button", { name: /Empresa Uno/ });
    const otherButton = screen.getByRole("button", { name: /Empresa Dos/ });
    expect(currentButton).toBeDisabled();
    expect(otherButton).toBeEnabled();
  });

  it("llama a onSelect con el id de la organizacion elegida (no la actual)", () => {
    const onSelect = vi.fn();
    render(
      <OrganizationSwitchDialog
        open
        onOpenChange={vi.fn()}
        options={OPTIONS}
        loading={false}
        busy={false}
        error={null}
        currentSlug="empresa-uno"
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Empresa Dos/ }));

    expect(onSelect).toHaveBeenCalledWith("org_2");
  });

  it("muestra un estado de carga mientras se buscan las organizaciones", () => {
    render(
      <OrganizationSwitchDialog
        open
        onOpenChange={vi.fn()}
        options={null}
        loading
        busy={false}
        error={null}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText(/buscando tus organizaciones/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Empresa/ })).not.toBeInTheDocument();
  });

  it("avisa cuando la persona solo pertenece a una organizacion", () => {
    render(
      <OrganizationSwitchDialog
        open
        onOpenChange={vi.fn()}
        options={[OPTIONS[0]]}
        loading={false}
        busy={false}
        error={null}
        currentSlug="empresa-uno"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText(/solo perteneces a esta organización/i)).toBeInTheDocument();
  });

  it("muestra el mensaje de error cuando la carga falla", () => {
    render(
      <OrganizationSwitchDialog
        open
        onOpenChange={vi.fn()}
        options={null}
        loading={false}
        busy={false}
        error="No pudimos cargar tus organizaciones."
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("No pudimos cargar tus organizaciones.")).toBeInTheDocument();
  });

  it("deshabilita las organizaciones no actuales mientras busy es true", () => {
    render(
      <OrganizationSwitchDialog
        open
        onOpenChange={vi.fn()}
        options={OPTIONS}
        loading={false}
        busy
        error={null}
        currentSlug="empresa-uno"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Empresa Dos/ })).toBeDisabled();
  });
});
