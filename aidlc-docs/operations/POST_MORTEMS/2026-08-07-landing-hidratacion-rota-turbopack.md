# 2026-08-07 — Landing sin interactividad en producción (hidratación rota por Turbopack) + link de acceso incorrecto

## Resumen

Una auditoría manual de `https://logify.cl` detectó dos problemas independientes
que, combinados, dejaban a un negocio nuevo sin ninguna vía funcional de
registrarse o iniciar sesión desde la landing:

1. **El registro self-service (`/registro`) y el formulario de demo no
   respondían a ningún clic.** Confirmado con evidencia directa (no
   inferido): al enviar el formulario con datos válidos, el navegador
   ejecutaba un `GET /registro?companyName=...&slug=...` (submit HTML nativo
   con los campos como query string) en vez de disparar el `fetch` a
   `POST /api/signup` que el código de `pages/registro.js` sí implementa
   correctamente. Sin errores en consola, sin peticiones de red al backend.
2. **El botón "Acceso Clientes" del header apuntaba a una app ajena.**
   `Landing/components/layout/Header1.js` tenía hardcodeado
   `https://logify-five.vercel.app` — un "E-LogBook Management System" para
   instituciones educativas de un proyecto no relacionado ("Stackveil") — en
   vez de `https://app.logify.cl`, la app real de Logify. El menú móvil
   (`Sidebar.js`) sí tenía el link correcto, lo que hacía el bug más difícil
   de notar (dependía de qué componente mirara quien probara el sitio).

## Causa raíz (los "5 por qué") — problema 1 (hidratación)

1. Los formularios no disparan `fetch` → porque React nunca adjunta sus
   event handlers a ningún nodo del DOM en el bundle de producción
   (confirmado: `Object.getOwnPropertyNames()` sobre `<form>`, `<button>` y
   `#__next` no contiene ninguna propiedad `__reactFiber*`/`__reactProps*`
   ni en producción ni en un build limpio local).
2. ¿Por qué React no hidrata? → el build de producción usa **Turbopack**
   (bundler por defecto de `next build` en Next.js 16.1.1). El HTML servido
   por SSR es correcto y el bundle JS carga con `200` y sin errores de
   sintaxis, pero el árbol de React nunca se monta sobre el DOM existente.
3. ¿Por qué no hay ningún error visible? → no lo hay. Se verificó
   explícitamente que errores no capturados SÍ llegan a la consola del
   navegador (prueba de control: un `throw` deliberado fue capturado), así
   que no es un problema de tooling de observación — Turbopack falla en
   silencio para esta combinación de Next 16.1.1 (Pages Router) + Turbopack.
4. ¿Por qué no se detectó antes de este audit? → no hay ningún test E2E ni
   smoke test que interactúe con la landing (clic real + verificación de
   efecto observable); los tests existentes son unitarios y no cubren
   hidratación real en un build de producción.
5. ¿Cómo se confirmó la causa exacta? → comparación controlada: mismo
   código, mismo `next build`, dos bundlers.
   `next build` (Turbopack, default) → `__reactFiber*` ausente, formulario
   cae a submit nativo. `next build --webpack` → `__reactFiber*` presente,
   `handleSubmit` se ejecuta (confirmado viendo el mensaje de error real
   `Failed to fetch` — CORS al probar desde `localhost`, comportamiento
   esperado — en vez del reset silencioso del submit nativo).

## Impacto

- **Funcionalidad afectada:** registro self-service completo (`/registro`),
  formulario de solicitud de demo (WhatsApp deep-link vía React state), y
  potencialmente cualquier otra interacción cliente de la landing (menú
  móvil, banner de cookies, acordeón de FAQ) — toda la landing quedaba como
  HTML estático no interactivo.
- **No afectado:** el backend (`api.logify.cl`) — se confirmó por `curl`
  directo que `/api/signup` y `/api/signup/check-slug` funcionan
  correctamente. `app.logify.cl` (login real) también funciona.
- **Acceso Clientes:** cualquier cliente que usara el botón del header de
  escritorio terminaba en una aplicación de otro producto sin relación con
  Logify.

## Remediación aplicada

1. `Landing/package.json`: `"build": "next build"` →
   `"build": "next build --webpack"`. Fuerza el build de producción a usar
   webpack en vez de Turbopack hasta que el bug de hidratación de Turbopack
   se resuelva río arriba en Next.js.
2. `Landing/next.config.js`: comentario explicando la razón del flag, para
   que nadie lo revierta sin contexto pensando que es un flag "por defecto
   más lento a eliminar".
3. `Landing/components/layout/Header1.js`: el link "Acceso Clientes" ahora
   apunta a `https://app.logify.cl` (igual que `Sidebar.js`).
4. Verificado end-to-end en local con build de producción limpio
   (`next build --webpack && next start`): `__reactFiber*` presente en el
   DOM, clic real en "Crear mi cuenta gratis" ejecuta `handleSubmit`, y el
   header muestra el link correcto.
5. `Landing/package.json` versión `1.0.0` → `1.0.1`.

## Seguimiento

- [ ] Desplegar el nuevo build (`next build --webpack`) a Vercel — este
      post-mortem documenta el fix en el código; el despliegue a producción
      queda pendiente de confirmación explícita antes de hacer push/deploy.
- [ ] Agregar un smoke test E2E (Playwright) que abra `/registro`, llene el
      formulario, haga clic real en el submit y verifique que aparece el
      mensaje de éxito o error (no que la URL cambie a un GET con query
      string) — esto hubiera detectado el bug en CI antes de llegar a
      producción.
- [ ] Revisar cuándo Next.js resuelve el bug de hidratación de Turbopack
      para Pages Router y remover el flag `--webpack` si corresponde.
- [ ] Auditar si `Landing/Frontend` (el dashboard React/Vite) tiene algún
      link duplicado con el mismo patrón de "dos componentes, una URL
      desactualizada" que causó el bug de "Acceso Clientes".

🤖 Generado con [Claude Code](https://claude.com/claude-code)
