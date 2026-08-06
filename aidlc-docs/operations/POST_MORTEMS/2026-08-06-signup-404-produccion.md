# 2026-08-06 — `/api/signup` inalcanzable en producción (404)

## Resumen

El registro self-service (`POST/GET /api/signup*`) quedó inalcanzable en
`https://api.logify.cl` tras mergear el PR #9 (onboarding self-service +
RLS). Causa raíz compuesta por dos gaps independientes, ambos confirmados
por evidencia directa (no inferidos):

1. **El VPS no se había redesplegado en varios ciclos de merge.** El
   despliegue es manual (`git pull` + `docker compose up -d --build`, ver
   `wiki/Despliegue-VPS.md`) — no hay CD automático. Al conectarse por SSH
   durante esta investigación, el checkout en `/home/deploy/logify` seguía
   en el commit `57fad77` (PR #3), **9 commits detrás de `main`**. El
   `orders-service` corriendo en producción no tenía el código de signup
   en absoluto, más allá de cualquier problema de ruteo.
2. **El gateway nginx (`Backend/nginx/nginx.conf`) nunca sumó los
   `location` blocks** para `/api/signup` y `/api/admin` — el gateway
   rutea por prefijo explícito y todo lo que no matchea cae en el
   catch-all 404. Fix en el commit `efac149` (PR #10).

## Línea de tiempo (timestamps verificados)

| Cuándo (UTC) | Evento |
|---|---|
| 2026-08-06 17:15:33 | PR #9 mergeado a `main` (`52e67d8`) — onboarding self-service + RLS |
| 2026-08-06 ~16:33 | GitHub Actions entra en **Major Outage** (confirmado vía `githubstatus.com`, componente "Actions") — afecta el push-CI del merge del PR #9 y todo CI posterior |
| 2026-08-06 18:18:00 | Commit `efac149` (fix del gateway) + apertura de PR #10 |
| 2026-08-06 18:21+ | CI de PR #10 queda en `queued` indefinidamente por el outage de GitHub Actions — no llega a correr |
| Esta sesión | Verificado por SSH: el VPS seguía en `57fad77` (no en `52e67d8`) — el redeploy manual post-merge nunca se hizo |
| Esta sesión | `GET /api/signup/check-slug` confirmado devolviendo `404` en vivo |
| Esta sesión | Remediación manual aplicada directamente en el VPS (detalle abajo) |
| Esta sesión | `GET /api/signup/check-slug` confirmado devolviendo `200` — resuelto |

No se pudo determinar con certeza el momento exacto en que un usuario real
intentó usar `/registro` y falló (no hay log agregado consultado para
esto) — el impacto de usuarios reales afectados es desconocido, no se
inventa un número.

## Remediación aplicada

Con GitHub Actions caído a nivel de plataforma, el flujo normal
(mergear PR #10 con CI verde → `git pull` en el VPS) no era viable sin
esperar sin ETA. Se optó por una intervención manual directa sobre el VPS,
documentada paso a paso para trazabilidad:

```bash
# 1. Traer los commits faltantes (57fad77 -> 52e67d8)
cd /home/deploy/logify
git pull origin main --ff-only

# 2. Aplicar el fix del gateway (PR #10, aún sin mergear) encima
git cherry-pick -n efac1495c9e203c69479268e76cd8be31d9cdce9

# 3. Reconstruir los 4 microservicios backend
docker compose -f docker-compose.prod.yml up -d --build

# 4. El gateway (nginx:alpine sin build propio) monta nginx.conf como
#    volumen de solo lectura -- Compose no detecta cambios de contenido
#    en archivos montados, así que no se reinicia solo con --build.
#    Requiere reinicio explícito:
docker compose -f docker-compose.prod.yml restart api-gateway

# 5. Verificación
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.logify.cl/api/signup/check-slug?slug=test   # -> 200
```

`Backend/nginx/nginx.conf` quedó modificado en el working tree del VPS
sin commitear (contenido idéntico al de PR #10). Cuando PR #10 se
mergee formalmente y se corra `git pull origin main` en el VPS, git
debería completar el fast-forward sin conflicto porque el contenido ya
coincide con lo que trae el merge — si diera error, resolver con
`git diff` primero, no con `git checkout --`.

## Impacto

- **Funcionalidad afectada:** registro self-service de nuevos tenants
  (`/registro` en Landing → `POST /api/signup`) y administración de
  cupones (`/api/admin/coupons`).
- **No afectado:** login, órdenes, inventario, envíos, notificaciones,
  POS — todo el resto de la plataforma seguía operando con normalidad
  (los 4 microservicios y Postgres estaban `healthy` durante todo el
  incidente, solo la ruta nueva devolvía 404).

## Causa raíz (los "5 por qué")

1. `/api/signup` devuelve 404 en prod → porque el gateway no lo ruteaba
   y además el backend desplegado no tenía el código.
2. ¿Por qué el backend desplegado no tenía el código? → porque el
   despliegue al VPS es manual y nadie corrió el `git pull` + rebuild
   después de mergear varios PRs recientes (#4 al #9).
3. ¿Por qué nadie lo notó antes? → no hay chequeo automático que
   compare el commit corriendo en el VPS contra `origin/main` (el
   `/healthz` verifica que el proceso esté vivo, no qué versión corre).
4. ¿Por qué el gateway tampoco tenía la ruta? → el patrón de
   `nginx.conf` es un `location` block manual por servicio/prefijo; se
   agregó el endpoint en `orders-service` sin el paso correspondiente
   en el gateway.
5. ¿Por qué esto no lo agarró CI? → el CI actual (`ci.yml`) corre tests
   unitarios de cada servicio, no un smoke test end-to-end contra el
   gateway real — un test de integración que golpee `/api/signup` a
   través de nginx lo hubiera detectado antes de mergear.

## Seguimiento

- [ ] Mergear PR #10 y PR #2 apenas GitHub Actions se recupere, para que
      `main` refleje exactamente lo que ya está corriendo en el VPS.
- [ ] Agregar un paso explícito de "verificar versión desplegada"
      (`git log -1` en el VPS vs. `origin/main`) al runbook de
      `wiki/Despliegue-VPS.md`, o automatizarlo con un endpoint
      `/version` que exponga el commit SHA de cada servicio.
- [ ] Evaluar un smoke test de CI que pegue contra `docker-compose.yml`
      local completo (a través del gateway, no directo al servicio) para
      detectar gaps de ruteo de nginx antes de mergear.
- [ ] Considerar redeploy automático al VPS on-merge-a-`main` (webhook o
      Action self-hosted) para eliminar el paso manual como fuente de
      drift — hoy es la causa raíz #2 de este incidente.

🤖 Generado con [Claude Code](https://claude.com/claude-code)
