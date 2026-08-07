# 2026-08-07 — Admin se autoelimina y queda bloqueado fuera de su cuenta

## Resumen

Un cliente real (tenant `la-isla-barber-studio`) reportó: creó un usuario
`jarol.ortega` con rol admin/owner y, al intentar eliminarlo, terminó
eliminando su propia cuenta. Confirmado en vivo: login contra
`https://la-isla-barber-studio.logify.cl` con esas credenciales devuelve
"Credenciales invalidas" — el usuario ya no existe y era el único de ese
tenant, dejando la cuenta completamente inaccesible (sin panel de
super-admin todavía, no hay forma de recuperarla desde la UI).

## Causa raíz

1. **Backend** — `DELETE /api/auth/users/:id` no tenía ninguna protección:
   no validaba que el usuario objetivo fuera distinto del usuario
   autenticado, ni que no fuera el último `owner` del tenant. Cualquier
   owner/admin podía eliminar su propia fila de `users` sin restricción.
2. **Frontend** — `users-page.tsx` usaba `confirm("Eliminar este usuario?")`
   (el diálogo nativo del navegador) para *cualquier* eliminación,
   indistintamente de si el objetivo era uno mismo. Un solo clic accidental
   en "Aceptar" es suficiente para una acción irreversible.

## Impacto

- Cualquier tenant con un solo usuario admin/owner podía quedar
  completamente bloqueado fuera de su cuenta con un clic, sin vía de
  recuperación self-service (no hay "olvidé mi usuario", solo "olvidé mi
  contraseña" — y esa ruta también requiere que el usuario exista).
- Confirmado que esto le pasó realmente a `la-isla-barber-studio`.

## Remediación aplicada

**Backend** (`Backend/orders-service/src/index.js`):
- `DELETE /api/auth/users/:id` ahora rechaza con `400` si:
  - el usuario objetivo es el mismo que el usuario autenticado
    (comparación por `username`, ya que el JWT no lleva el id numérico —
    ver `signToken` en `shared/auth.js`), o
  - el usuario objetivo es el único `owner` restante del tenant.
- Nuevo endpoint de recuperación `POST /api/admin/tenants/:slug/reset-owner`
  (protegido con el mismo `PLATFORM_ADMIN_KEY` que ya usa
  `/api/admin/coupons`, pensado para `curl`/Postman, no UI): crea o
  resetea un usuario `owner` para cualquier tenant por slug. Es la única
  vía hoy para recuperar un tenant ya bloqueado — no existía ningún
  mecanismo de recuperación antes de este fix.

**Frontend** (`Frontend/src/pages/users-page.tsx`):
- El botón "Eliminar" se deshabilita (con tooltip explicando por qué) en
  la fila del propio usuario autenticado.
- Reemplazado el `confirm()` nativo por un diálogo que exige escribir el
  `username` exacto del usuario a eliminar para habilitar el botón de
  confirmación — fricción intencional para una acción irreversible, en
  vez de un solo clic en "OK".

## Recuperación pendiente de `la-isla-barber-studio`

Este postmortem **no recuperó** la cuenta del cliente — no hay acceso a la
base de datos de producción ni al `PLATFORM_ADMIN_KEY` desde este entorno
de desarrollo. Una vez desplegado este fix, recuperar el acceso requiere
correr, con el `PLATFORM_ADMIN_KEY` real de producción:

```bash
curl -X POST https://api.logify.cl/api/admin/tenants/la-isla-barber-studio/reset-owner \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <PLATFORM_ADMIN_KEY de produccion>" \
  -d '{"username":"jarol.ortega","password":"<nueva-clave-temporal>","name":"Jarol Ortega"}'
```

Esto recrea a `jarol.ortega` como owner del tenant con la contraseña
indicada, sin afectar el resto de los datos (productos, pedidos, clientes,
etc. — nada de eso se tocó, solo la tabla `users` quedó sin filas para ese
tenant).

## Seguimiento

- [ ] Ejecutar el `curl` de recuperación de arriba contra producción para
      devolverle el acceso al cliente de `la-isla-barber-studio`.
- [ ] Evaluar si otros roles además de `owner` deberían considerarse
      "administradores" a efectos de la protección de último-admin (hoy
      solo se protege el rol `owner` literal).
- [ ] El endpoint de recuperación no queda registrado en ningún log de
      auditoría visible en UI — para un panel de super-admin futuro (Fase
      4E, ver `wiki/Multi-Tenant.md`) esto debería loguearse explícitamente
      dado que resetea credenciales.

🤖 Generado con [Claude Code](https://claude.com/claude-code)
