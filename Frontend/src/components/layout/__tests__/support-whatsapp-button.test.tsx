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
});
