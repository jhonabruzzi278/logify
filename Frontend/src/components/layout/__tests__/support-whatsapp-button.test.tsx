import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupportWhatsappButton } from "@/components/layout/support-whatsapp-button";

describe("SupportWhatsappButton", () => {
  it("enlaza al WhatsApp de soporte con mensaje precargado, en una pestaña nueva", () => {
    render(<SupportWhatsappButton />);

    const link = screen.getByRole("link", { name: "Contactar soporte por WhatsApp" });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/56938980598?text="));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("usa el verde de marca por defecto", () => {
    render(<SupportWhatsappButton />);

    const link = screen.getByRole("link", { name: "Contactar soporte por WhatsApp" });
    expect(link.className).toContain("bg-[#25D366]");
  });

  it("usa estilo blanco y negro cuando variant es mono", () => {
    render(<SupportWhatsappButton variant="mono" />);

    const link = screen.getByRole("link", { name: "Contactar soporte por WhatsApp" });
    expect(link.className).toContain("bg-[#0f172a]");
    expect(link.className).not.toContain("bg-[#25D366]");
  });
});
