# ADR-004: Delegar la autenticación a Clerk (IDaaS), preservando el modelo de roles/tenant actual

**Status:** Propuesto — groundwork aditivo implementado (2026-08-17), corte real pendiente de configuración manual del usuario en el dashboard de Clerk.
**Fecha:** 2026-08-17

## Contexto

Logify autentica hoy con JWT propio (`Backend/shared/auth.js`), firmado con `JWT_SECRET`, contra un `POST /api/auth/login` que valida usuario/contraseña con bcrypt sobre la tabla `users` de `orders_db`. Este esquema reemplazó una integración previa con AWS Cognito (commit `4b6dd3b`, "reemplazar auth Cognito/demo por JWT backend simple") — pero ese mismo commit dejó un punto de extensión explícito en `Frontend/src/lib/auth-service.ts`: *"Para cambiar de proveedor (Clerk, Supabase, Cognito, Google), solo reemplaza el cuerpo de esta función"*.

El dueño del producto pidió delegar el login a un IDaaS y eligió **Clerk**, por:
- Es el primer proveedor nombrado en ese punto de extensión ya existente.
- SDK de React nativo (`@clerk/clerk-react`) — el Frontend es Vite + React 18, no necesita adaptar a un framework distinto.
- Integración nativa con Vercel (donde ya se despliegan Frontend y Landing).
- **Organizations**: Clerk modela nativamente "un usuario pertenece a una o más organizaciones y cambia entre ellas" — coincide con la meta declarada de una barra selectora post-login para acceder a distintas sucursales/organizaciones, sin tener que construir ese mecanismo desde cero.

El sistema tiene tenants reales en producción desde 2026-08-06 (aunque en etapa de portafolio/validación, sin evidencia de clientes externos — ver `00_PROJECT_METADATA.md`), así que la migración no puede arriesgar el login de nadie mientras se decide y configura.

## Decisión

### Modelo de mapeo Clerk ↔ Logify

| Concepto Clerk | Concepto Logify | Notas |
|---|---|---|
| Organization | `tenants` (fila) | `tenants.clerk_org_id` (nuevo, nullable, unique) es el puente. `tenants.slug` se mantiene — sigue resolviendo el subdominio hasta que se aborde una fase de dominio único. |
| User | `users` (fila) | `users.clerk_user_id` (nuevo, nullable, unique) es el puente. `password_hash`/`secret_question`/`secret_answer_hash` quedan en la tabla pero dejan de ser obligatorias para usuarios autenticados vía Clerk. |
| Organization Membership | `users.role` + `users.tenant_id` | El rol/tenant de un usuario viven como `publicMetadata` de la membership en Clerk, no solo en la fila local — ver JWT Template abajo. |
| Session token (JWT Template custom) | `req.user` (idéntico al de hoy) | Claims custom `username`, `name`, `role`, `tenant_id`, `tenant_slug` — mismos nombres que ya produce `signToken()` en `shared/auth.js`, para no tocar `requireRole`/`requireTenant`/`extractRoleFromRequest` ni los ~80 call sites que dependen de esa forma. |

**Por qué el JWT Template en vez de resolver rol/tenant con una query por request:** el modelo actual es stateless (todo viaja en el JWT, cero roundtrip a DB para autorizar). Un JWT Template de Clerk permite seguir siendo así — se verifica el token localmente (JWKS cacheado) y los claims custom ya traen todo lo que `requireRole`/`requireTenant` necesitan.

**`sub` no es el Clerk user ID:** para no romper comparaciones existentes como `target.username === req.user.sub` (`orders-service/src/routes/auth.routes.js`), el claim `username` del JWT Template se mapea a `req.user.sub` en `shared/clerk-auth.js` — el código de aplicación nunca ve el ID nativo de Clerk como `sub`.

### Estrategia de corte: aditiva y opt-in, no dual-auth permanente

- `authMiddleware` intenta verificar como token de Clerk **solo si `CLERK_SECRET_KEY` está configurada**; si no lo está, el comportamiento es idéntico al actual (JWT propio). Si está configurada pero la verificación Clerk falla, cae al JWT propio — así ningún entorno se rompe mientras se configura Clerk gradualmente.
- No es una arquitectura dual-auth para siempre: una vez que un tenant esté migrado a Clerk, la intención es cortar el JWT propio para ese tenant (fase 2, no cubierta por este ADR).
- Sincronización `tenants`/`users` vía webhook de Clerk (`organization.created`, `organizationMembership.created|updated|deleted`) hacia `POST /api/webhooks/clerk` en `orders-service`, verificado con firma Svix (la librería de firma que usa Clerk para webhooks) — no con `PLATFORM_ADMIN_KEY`.

## Consecuencias

**Positivas:**
- Clerk gestiona contraseñas, recuperación, MFA opcional y sesión de forma más segura que el `localStorage` actual (`Frontend/src/app/auth.tsx`), que la regla de seguridad de React del proyecto marca como patrón a evitar.
- El `security-module.js` (recuperación por pregunta secreta) deja de ser necesario para tenants migrados, sin tener que reescribirlo — Clerk lo reemplaza nativamente.
- Organizations de Clerk deja pavimentado el selector de sucursales/organizaciones sin construir esa infraestructura a mano.
- Cero cambio para `requireRole`/`requireTenant`/RLS (`shared/rls.js`) — el contrato `req.user` no cambia de forma.

**Negativas / riesgos:**
- Dependencia nueva de un proveedor externo para una función crítica (login) — mitigado por mantener el JWT propio como fallback mientras dure la transición.
- `@clerk/backend` se agrega como dependencia a los **4** servicios (todos requieren `shared/auth.js`), aunque solo `orders-service` habla directamente con la API de gestión de Clerk (webhooks).
- El JWT Template requiere configuración manual en el dashboard de Clerk — no es algo que se pueda automatizar desde este repo.
- Migrar los 8 usuarios demo existentes a Clerk (crear sus Organizations/Users vía API o dashboard) es trabajo manual de la fase de corte, no de este groundwork.

## Checklist de configuración manual (dashboard de Clerk — el usuario debe hacerlo, no es automatizable desde el repo)

1. Crear la aplicación en [Clerk Dashboard](https://dashboard.clerk.com).
2. Activar **Organizations** (Configure → Organizations).
3. Crear un **JWT Template** custom con claims:
   ```json
   {
     "username": "{{org_membership.public_metadata.username}}",
     "name": "{{user.first_name}} {{user.last_name}}",
     "role": "{{org_membership.public_metadata.role}}",
     "tenant_id": "{{organization.public_metadata.tenant_id}}",
     "tenant_slug": "{{organization.public_metadata.tenant_slug}}"
   }
   ```
4. Configurar el endpoint de webhook: `https://api.logify.cl/api/webhooks/clerk`, suscrito a `organization.created`, `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`. Copiar el **signing secret** (`whsec_...`).
5. Variables de entorno a setear (GitHub Secrets para CI/CD del VPS, `.env` local, Vercel para el Frontend):
   - Backend (los 4 servicios, o al menos `orders-service` que además necesita el signing secret del webhook): `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`.
   - Frontend (Vercel): `VITE_CLERK_PUBLISHABLE_KEY`.
6. Empezar con el entorno de desarrollo/sandbox de Clerk (gratis) antes de tocar producción.

## Alternativas consideradas

- **Auth0**: más maduro en SSO/compliance empresarial, pero sin integración nativa con Vercel y más caro a escala para un proyecto en etapa de validación.
- **AWS Cognito**: ya se usó y se sacó activamente del proyecto sin que quede documentado el motivo exacto (no hay ADR de esa decisión) — se descartó volver sin revisar esa historia primero.
- **No usar IDaaS, seguir con JWT propio**: descartado explícitamente por el dueño del producto — quiere delegar la función de login, no seguir manteniéndola a mano.
