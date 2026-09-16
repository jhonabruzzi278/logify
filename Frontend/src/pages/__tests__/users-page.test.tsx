import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { UsersPage } from "@/pages/users-page";

vi.mock("@/app/auth", () => ({
  useAuth: () => ({ session: { token: "tok", username: "admin", name: "Admin", role: "owner", expiresAt: Date.now() + 1000000 } }),
}));

const mockFetchUsers = vi.fn();
const mockDeleteUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockInviteUser = vi.fn();

vi.mock("@/lib/local-jwt-auth", () => ({
  fetchUsers: (...args: unknown[]) => mockFetchUsers(...args),
  fetchInvitations: vi.fn().mockResolvedValue([]),
  inviteUser: (...args: unknown[]) => mockInviteUser(...args),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}));

const USERS = [
  { id: 1, username: "admin", name: "Admin Owner", email: "admin@empresa.cl", role: "owner", created_at: "2026-01-01", updated_at: "2026-01-01", last_login_at: null },
  { id: 2, username: "empleado", name: "Empleado Uno", email: "empleado@empresa.cl", role: "ops", created_at: "2026-01-01", updated_at: "2026-01-01", last_login_at: null },
];

// El componente renderiza dos layouts (mobile y desktop) simultaneamente en
// el DOM y los oculta por CSS -- jsdom no evalua media queries, asi que
// cualquier texto/boton aparece duplicado. Se usa getAllBy*()[0] en vez de
// getBy* para evitar falsos "multiple elements found".

describe("UsersPage — proteccion de autoeliminacion", () => {
  beforeEach(() => {
    mockFetchUsers.mockReset();
    mockDeleteUser.mockReset();
    mockUpdateUser.mockReset();
    mockInviteUser.mockReset();
    mockFetchUsers.mockResolvedValue(USERS);
    mockDeleteUser.mockResolvedValue(undefined);
    mockInviteUser.mockResolvedValue({ id: 3, email: "nuevo@empresa.cl", name: "Nuevo Usuario", role: "ops", status: "pending", expires_at: "2026-09-23", created_at: "2026-09-16" });
    mockUpdateUser.mockImplementation(async (_token, id, changes) => ({
      ...USERS.find((user) => user.id === id),
      ...changes,
    }));
  });

  it("deshabilita el boton de eliminar en la propia fila del usuario autenticado", async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getAllByText("Admin Owner").length).toBeGreaterThan(0));

    const ownRowButtons = screen.getAllByTitle("No puedes eliminar tu propia cuenta");
    expect(ownRowButtons[0]).toBeDisabled();
    expect(screen.getAllByTitle("Eliminar usuario").length).toBeGreaterThan(0);
  });

  it("exige escribir el correo exacto antes de habilitar la eliminacion definitiva", async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getAllByText("Empleado Uno").length).toBeGreaterThan(0));

    const otherRowDeleteButtons = screen.getAllByTitle("Eliminar usuario");
    fireEvent.click(otherRowDeleteButtons[0]);

    const confirmButton = screen.getByRole("button", { name: /eliminar definitivamente/i });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByPlaceholderText("empleado@empresa.cl");
    fireEvent.change(input, { target: { value: "texto-incorrecto" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "empleado@empresa.cl" } });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledWith("tok", 2));
  });

  it("guarda nombre y rol juntos al editar un usuario", async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getAllByText("Empleado Uno").length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[1]);
    const nameInput = screen.getAllByLabelText("Nombre de empleado")[0];
    const roleSelect = screen.getAllByLabelText("Rol de empleado")[0];
    fireEvent.change(nameInput, { target: { value: "Empleado Actualizado" } });
    fireEvent.change(roleSelect, { target: { value: "warehouse" } });
    fireEvent.click(screen.getAllByRole("button", { name: /guardar/i })[0]);

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith("tok", 2, {
      name: "Empleado Actualizado",
      role: "warehouse",
    }));
    await waitFor(() => expect(screen.getAllByText("Empleado Actualizado").length).toBeGreaterThan(0));
  });

  it("envía una invitación sin pedir ni enviar contraseña", async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getAllByText("Empleado Uno").length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole("button", { name: /invitar persona/i })[0]);
    fireEvent.change(screen.getByPlaceholderText("Nombre completo"), { target: { value: "Nuevo Usuario" } });
    fireEvent.change(screen.getByPlaceholderText("empleado@empresa.com"), { target: { value: "nuevo@empresa.cl" } });
    expect(screen.queryByPlaceholderText("••••••")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mockInviteUser).toHaveBeenCalledWith("tok", {
      email: "nuevo@empresa.cl",
      name: "Nuevo Usuario",
      role: "ops",
    }));
    await waitFor(() => expect(screen.getAllByText(/invitación enviada/i).length).toBeGreaterThan(0));
  });

  it("explica que una cuenta existente conserva sus credenciales", async () => {
    render(<UsersPage />);
    await waitFor(() => expect(screen.getAllByText("Empleado Uno").length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole("button", { name: /invitar persona/i })[0]);
    expect(screen.getByText(/si ya usa Logify, ingresará con su cuenta actual/i)).toBeInTheDocument();
  });
});
