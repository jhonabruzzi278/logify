import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { UsersPage } from "@/pages/users-page";

vi.mock("@/app/auth", () => ({
  useAuth: () => ({ session: { token: "tok", username: "admin", name: "Admin", role: "owner", expiresAt: Date.now() + 1000000 } }),
}));

const mockFetchUsers = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock("@/lib/local-jwt-auth", () => ({
  fetchUsers: (...args: unknown[]) => mockFetchUsers(...args),
  registerUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  inviteUser: vi.fn(),
}));

const USERS = [
  { id: 1, username: "admin", name: "Admin Owner", role: "owner", created_at: "2026-01-01", updated_at: "2026-01-01", last_login_at: null },
  { id: 2, username: "empleado", name: "Empleado Uno", role: "ops", created_at: "2026-01-01", updated_at: "2026-01-01", last_login_at: null },
];

// El componente renderiza dos layouts (mobile y desktop) simultaneamente en
// el DOM y los oculta por CSS -- jsdom no evalua media queries, asi que
// cualquier texto/boton aparece duplicado. Se usa getAllBy*()[0] en vez de
// getBy* para evitar falsos "multiple elements found".

describe("UsersPage — proteccion de autoeliminacion", () => {
  beforeEach(() => {
    mockFetchUsers.mockReset();
    mockDeleteUser.mockReset();
    mockFetchUsers.mockResolvedValue(USERS);
    mockDeleteUser.mockResolvedValue(undefined);
  });

  it("deshabilita el boton de eliminar en la propia fila del usuario autenticado", async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getAllByText("Admin Owner").length).toBeGreaterThan(0));

    const ownRowButtons = screen.getAllByTitle("No puedes eliminar tu propia cuenta");
    expect(ownRowButtons[0]).toBeDisabled();
    expect(screen.getAllByTitle("Eliminar usuario").length).toBeGreaterThan(0);
  });

  it("exige escribir el username exacto antes de habilitar la eliminacion definitiva", async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getAllByText("Empleado Uno").length).toBeGreaterThan(0));

    const otherRowDeleteButtons = screen.getAllByTitle("Eliminar usuario");
    fireEvent.click(otherRowDeleteButtons[0]);

    const confirmButton = screen.getByRole("button", { name: /eliminar definitivamente/i });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByPlaceholderText("empleado");
    fireEvent.change(input, { target: { value: "texto-incorrecto" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "empleado" } });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledWith("tok", 2));
  });
});
