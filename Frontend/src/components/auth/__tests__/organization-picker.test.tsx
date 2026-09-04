import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrganizationPicker } from "@/components/auth/organization-picker";

const OPTIONS = [
  { id: "org_1", name: "Empresa Uno", slug: "empresa-uno" },
  { id: "org_2", name: "Empresa Dos", slug: "empresa-dos" },
];

describe("OrganizationPicker", () => {
  it("renderiza un boton por cada organizacion", () => {
    render(<OrganizationPicker options={OPTIONS} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Empresa Uno/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Empresa Dos/ })).toBeInTheDocument();
  });

  it("llama a onSelect con el id de la organizacion elegida", () => {
    const onSelect = vi.fn();
    render(<OrganizationPicker options={OPTIONS} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /Empresa Dos/ }));

    expect(onSelect).toHaveBeenCalledWith("org_2");
  });

  it("deshabilita los botones mientras busy es true", () => {
    render(<OrganizationPicker options={OPTIONS} onSelect={vi.fn()} busy />);

    expect(screen.getByRole("button", { name: /Empresa Uno/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Empresa Dos/ })).toBeDisabled();
  });
});
