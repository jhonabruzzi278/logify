import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Edit2, Search, Trash2, UserPlus, X } from "lucide-react";
import { getRoleProfile } from "@/app/access";
import { useAuth } from "@/app/auth";
import { fetchUsers, registerUser, updateUser, deleteUser } from "@/lib/local-jwt-auth";
import { cn, onActivateKey } from "@/lib/utils";
import type { Role } from "@/types/domain";

const ROLES: Role[] = ["owner", "ops", "warehouse", "support", "customer", "shipper", "vendor"];

interface UserRecord {
  id: number;
  username: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export function UsersPage() {
  const { session } = useAuth();
  const token = session?.token ?? "";
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [showMatrix, setShowMatrix] = useState(false);
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; role: Role } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "ops" as Role });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await fetchUsers(token);
      setUsers(data.map((u) => ({ ...u, role: u.role as Role })));
    } catch {
      setFeedback("Error al cargar usuarios");
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((u) => `${u.name} ${u.username}`.toLowerCase().includes(q));
    }
    return list;
  }, [users, roleFilter, query]);

  function handleDelete(user: UserRecord) {
    setDeleteTarget(user);
    setDeleteConfirmText("");
  }

  async function confirmDelete() {
    if (deleteConfirmText.trim().toLowerCase() !== deleteTarget?.email.toLowerCase()) return;
    setDeleting(true);
    try {
      await deleteUser(token, deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setFeedback("Usuario eliminado");
      setDeleteTarget(null);
    } catch (e: any) {
      setFeedback(e.message || "Error al eliminar");
    } finally {
      setDeleting(false);
    }
    setTimeout(() => setFeedback(null), 3000);
  }

  function startEditing(user: UserRecord) {
    setEditingUser(user.id);
    setEditDraft({ name: user.name, role: user.role });
  }

  function cancelEditing() {
    setEditingUser(null);
    setEditDraft(null);
  }

  async function handleSaveUser(user: UserRecord) {
    const name = editDraft?.name.trim() ?? "";
    if (!name) {
      setFeedback("El nombre es obligatorio");
      return;
    }
    setEditSaving(true);
    try {
      const updated = await updateUser(token, user.id, { name, role: editDraft?.role ?? user.role });
      setUsers((prev) => prev.map((item) => item.id === user.id ? { ...item, name: updated.name, role: updated.role as Role } : item));
      cancelEditing();
      setFeedback("Usuario actualizado");
    } catch (e: any) {
      setFeedback(e.message || "Error al actualizar usuario");
    } finally {
      setEditSaving(false);
    }
    setTimeout(() => setFeedback(null), 3000);
  }

  async function handleAddUser() {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password) {
      setFeedback("Nombre, correo y contraseña son requeridos");
      setTimeout(() => setFeedback(null), 3000);
      return;
    }
    try {
      const created = await registerUser(token, {
        email: newUser.email.trim().toLowerCase(),
        password: newUser.password,
        name: newUser.name.trim(),
        role: newUser.role,
      });
      setUsers((prev) => [...prev, { ...created, role: created.role as Role, created_at: "", updated_at: "", last_login_at: null }]);
      setNewUser({ name: "", email: "", password: "", role: "ops" });
      setShowAdd(false);
      setFeedback(created.linkedExistingAccount ? `${created.name} ya tenía cuenta en Logify y fue agregado a tu empresa` : "Usuario creado");
    } catch (e: any) {
      setFeedback(e.message || "Error al crear usuario");
    }
    setTimeout(() => setFeedback(null), 3000);
  }

  const initials = (name: string) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const roleBadgeColors: Record<Role, string> = {
    owner: "bg-purple-50 text-purple-600",
    ops: "bg-[#2563EB]/10 text-[#2563EB]",
    warehouse: "bg-[#D97706]/10 text-[#D97706]",
    support: "bg-blue-50 text-blue-600",
    customer: "bg-slate-50 text-slate-500",
    shipper: "bg-green-50 text-green-600",
    vendor: "bg-orange-50 text-orange-600",
  };

  const roleInitialColors: Record<Role, string> = {
    owner: "bg-purple-500",
    ops: "bg-[#2563EB]",
    warehouse: "bg-[#D97706]",
    support: "bg-blue-500",
    customer: "bg-slate-500",
    shipper: "bg-green-500",
    vendor: "bg-orange-500",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-[#64748B]">Cargando usuarios...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-md mx-auto sm:max-w-3xl md:max-w-5xl lg:max-w-7xl xl:max-w-screen-xl px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[1.2px] text-[#64748B]">Administración</p>
          <h1 className="text-xl font-bold text-[#172554]">Usuarios y roles</h1>
        </div>
        <div className="flex gap-2">
          <button type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 rounded bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1D4ED8]"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Agregar usuario
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded border border-[#E2E8F0] bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="users-page-f234" className="block text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B] mb-1">Nombre</label>
              <input id="users-page-f234" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className="h-9 w-full rounded border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm" placeholder="Nombre completo" />
            </div>
            <div className="flex-1">
              <label htmlFor="users-page-f238" className="block text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B] mb-1">Correo</label>
              <input id="users-page-f238" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} className="h-9 w-full rounded border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm" placeholder="empleado@empresa.com" />
            </div>
            <div className="flex-1">
              <label htmlFor="users-page-f242" className="block text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B] mb-1">Contraseña</label>
              <input id="users-page-f242" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="h-9 w-full rounded border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm" placeholder="••••••" />
            </div>
            <div>
              <label htmlFor="users-page-f246" className="block text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B] mb-1">Rol</label>
              <select id="users-page-f246" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })} className="h-9 rounded border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-sm">
                {ROLES.map((r) => <option key={r} value={r}>{getRoleProfile(r).label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleAddUser} className="h-9 rounded bg-[#2563EB] px-4 text-xs font-bold text-white hover:bg-[#1D4ED8]">Crear</button>
              <button type="button" onClick={() => setShowAdd(false)} className="h-9 rounded border border-[#E2E8F0] px-3 text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC]">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar usuario..." className="h-9 w-full rounded border border-[#E2E8F0] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#64748B]" />
        </div>
        <div className="flex gap-1 rounded border border-[#E2E8F0] bg-white p-0.5 overflow-x-auto">
          <button type="button" onClick={() => setRoleFilter("all")} className={cn("rounded px-3 py-1 text-[11px] font-semibold transition-colors", roleFilter === "all" ? "bg-[#2563EB] text-white" : "text-[#64748B] hover:text-[#172554]")}>Todos</button>
          {ROLES.map((r) => (
            <button type="button" key={r} onClick={() => setRoleFilter(r)} className={cn("rounded px-3 py-1 text-[11px] font-semibold transition-colors", roleFilter === r ? "bg-[#2563EB] text-white" : "text-[#64748B] hover:text-[#172554]")}>{getRoleProfile(r).label}</button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className="rounded border border-[#0D9488]/30 bg-[#0D9488]/5 px-4 py-2 text-xs font-medium text-[#0D9488]">{feedback}</div>
      )}

      <div className="rounded border border-[#E2E8F0] bg-white">
        <div className="block sm:hidden">
          {filtered.length === 0 && (
            <div className="px-4 py-12 text-center text-xs text-[#64748B]">Sin usuarios que coincidan</div>
          )}
          <div className="flex flex-col gap-3 p-3">
            {filtered.map((user) => (
              <div key={user.id} className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-base font-bold text-white", roleInitialColors[user.role])}>
                    {initials(user.name)}
                  </div>
                  <div className="flex-1">
                    {editingUser === user.id ? (
                      <input
                        aria-label={`Nombre de ${user.username}`}
                        value={editDraft?.name ?? ""}
                        onChange={(e) => setEditDraft((draft) => draft ? { ...draft, name: e.target.value } : draft)}
                        onKeyDown={(e) => { if (e.key === "Escape") cancelEditing(); }}
                        className="h-9 w-full rounded border border-[#2563EB] bg-white px-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                        autoFocus
                      />
                    ) : (
                      <p className="font-semibold text-[#172554]">{user.name}</p>
                    )}
                    <p className="text-xs text-[#64748B]">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(user)}
                    disabled={user.username === session?.username}
                    title={user.username === session?.username ? "No puedes eliminar tu propia cuenta" : "Eliminar usuario"}
                    className="rounded p-1 text-[#64748B] hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-[#64748B]"
                  ><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-[#64748B]">
                  <span className="font-semibold text-[#2563EB]">{getRoleProfile(user.role).label}</span>
                  <span>Último acceso: {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString("es-CL") : "Nunca"}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button"
                    onClick={() => startEditing(user)}
                    className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold group border border-[#2563EB] text-[#2563EB]", editingUser === user.id && "bg-[#2563EB]/10")}
                  >
                    Editar
                  </button>
                </div>
                {editingUser === user.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      aria-label={`Rol de ${user.username}`}
                      value={editDraft?.role ?? user.role}
                      onChange={(e) => setEditDraft((draft) => draft ? { ...draft, role: e.target.value as Role } : draft)}
                      className="h-9 flex-1 rounded border border-[#2563EB] bg-white px-2 text-xs"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{getRoleProfile(r).label}</option>)}
                    </select>
                    <button type="button" onClick={() => handleSaveUser(user)} disabled={editSaving} className="inline-flex h-9 items-center gap-1 rounded bg-[#2563EB] px-3 text-xs font-bold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Guardar</button>
                    <button type="button" aria-label="Cancelar edición" onClick={cancelEditing} className="h-9 rounded border border-[#E2E8F0] px-2 text-[#64748B] hover:text-[#172554]"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[0.6875rem] font-bold uppercase tracking-[0.92px] text-[#64748B]">
                <th className="px-4 py-3 w-10"></th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3 hidden md:table-cell">Creado</th>
                <th className="px-4 py-3 hidden md:table-cell">Último acceso</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-[#F8FAFC] hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3">
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white", roleInitialColors[user.role])}>
                      {initials(user.name)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {editingUser === user.id ? (
                      <input
                        aria-label={`Nombre de ${user.username}`}
                        value={editDraft?.name ?? ""}
                        onChange={(e) => setEditDraft((draft) => draft ? { ...draft, name: e.target.value } : draft)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveUser(user); if (e.key === "Escape") cancelEditing(); }}
                        className="h-9 w-full rounded border border-[#2563EB] bg-white px-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                        autoFocus
                      />
                    ) : (
                      <>
                        <p
                          role="button"
                          tabIndex={0}
                          className="font-semibold text-[#172554] cursor-pointer hover:text-[#2563EB]"
                          onClick={() => startEditing(user)}
                          onKeyDown={onActivateKey(() => startEditing(user))}
                        >{user.name}</p>
                        <p className="text-xs text-[#64748B]">{user.email}</p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingUser === user.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          aria-label={`Rol de ${user.username}`}
                          value={editDraft?.role ?? user.role}
                          onChange={(e) => setEditDraft((draft) => draft ? { ...draft, role: e.target.value as Role } : draft)}
                          className="h-9 min-w-32 rounded border border-[#2563EB] bg-white px-2 text-xs"
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{getRoleProfile(r).label}</option>)}
                        </select>
                        <button type="button" aria-label="Guardar usuario" onClick={() => handleSaveUser(user)} disabled={editSaving} className="inline-flex h-9 w-9 items-center justify-center rounded bg-[#2563EB] text-white disabled:opacity-50"><Check className="h-4 w-4" /></button>
                        <button type="button" aria-label="Cancelar edición" onClick={cancelEditing} className="inline-flex h-9 w-9 items-center justify-center rounded border border-[#E2E8F0] text-[#64748B] hover:text-[#172554]"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <button type="button"
                        onClick={() => startEditing(user)}
                        className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold group", roleBadgeColors[user.role])}
                      >
                        {getRoleProfile(user.role).label}
                        <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#64748B] hidden md:table-cell">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString("es-CL") : "-"}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#64748B] hidden md:table-cell">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString("es-CL") : "Nunca"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                    type="button"
                    onClick={() => handleDelete(user)}
                    disabled={user.username === session?.username}
                    title={user.username === session?.username ? "No puedes eliminar tu propia cuenta" : "Eliminar usuario"}
                    className="rounded p-1 text-[#64748B] hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-[#64748B]"
                  ><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-xs text-[#64748B]">Sin usuarios que coincidan</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded border border-[#E2E8F0] bg-white">
        <button type="button" onClick={() => setShowMatrix(!showMatrix)} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <h2 className="text-sm font-bold text-[#172554]">Matriz de permisos por rol</h2>
          <ChevronDown className={cn("h-4 w-4 text-[#64748B] transition-transform", showMatrix && "rotate-180")} />
        </button>
        {showMatrix && (
          <div className="overflow-x-auto border-t border-[#E2E8F0] p-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0]">
                  <th className="py-2 pr-4 font-bold text-[#172554] text-left">Permiso</th>
                  {ROLES.map((r) => (
                    <th key={r} className="py-2 px-3 text-center font-bold text-[#172554]">
                      {getRoleProfile(r).label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { perm: "Ver dashboard", key: "dashboard.view" },
                  { perm: "Ver inventario", key: "inventory.view" },
                  { perm: "Ajustar/crear inventario", key: "inventory.adjust" },
                  { perm: "Importar productos", key: "products.import" },
                  { perm: "Ver pedidos", key: "orders.view" },
                  { perm: "Crear pedidos", key: "orders.create" },
                  { perm: "Validar/confirmar/cancelar pedidos", key: "orders.review" },
                  { perm: "Asignar transportista", key: "orders.assign" },
                  { perm: "Eliminar pedidos", key: "orders.delete" },
                  { perm: "Ver envios", key: "shipments.view" },
                  { perm: "Gestionar envios", key: "shipments.update" },
                  { perm: "Crear despachos", key: "shipments.dispatch" },
                  { perm: "Ver alertas", key: "alerts.view" },
                  { perm: "Ver usuarios", key: "users.view" },
                  { perm: "Gestionar usuarios", key: "users.manage" },
                  { perm: "Gestionar clientes", key: "customers.manage" },
                  { perm: "Vender / caja (POS)", key: "sales.create" },
                  { perm: "Gestionar proveedores", key: "suppliers.manage" },
                  { perm: "Registrar compras", key: "purchases.manage" },
                  { perm: "Configuracion del negocio", key: "settings.manage" },
                  { perm: "Vaciar notificaciones", key: "notifications.manage" },
                ].map(({ perm, key }) => (
                  <tr key={key} className="border-b border-[#F8FAFC]">
                    <td className="py-2 pr-4 font-medium text-[#172554]">{perm}</td>
                    {ROLES.map((r) => {
                      const has = getRoleProfile(r).permissions.includes(key as any);
                      return (
                        <td key={r} className="py-2 px-3 text-center">
                          {has ? (
                            <Check className="mx-auto h-4 w-4 text-[#0D9488]" />
                          ) : (
                            <span className="text-[#E2E8F0]">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#172554]">Eliminar usuario</h3>
                <p className="mt-1 text-xs text-[#64748B]">
                  Vas a eliminar a <strong className="text-[#172554]">{deleteTarget.name}</strong> ({deleteTarget.email}).
                  Esta acción es irreversible y no se puede deshacer.
                </p>
              </div>
            </div>
            <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.92px] text-[#64748B]">
              Escribe <span className="font-mono normal-case text-red-500">{deleteTarget.email}</span> para confirmar
            </label>
            <input
              autoFocus
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && deleteConfirmText.trim().toLowerCase() === deleteTarget.email.toLowerCase()) confirmDelete(); }}
              className="mt-1.5 h-9 w-full rounded border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm outline-none focus:border-red-400"
              placeholder={deleteTarget.email}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-9 rounded border border-[#E2E8F0] px-3 text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting || deleteConfirmText.trim().toLowerCase() !== deleteTarget.email.toLowerCase()}
                className="h-9 rounded bg-red-500 px-4 text-xs font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
