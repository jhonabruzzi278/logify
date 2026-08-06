# Flujo de Git — PR obligatorio a `main`

Desde el 2026-08-06, `main` tiene protección de rama activa en GitHub. Esto
es lo que cambia en el día a día y por qué.

## Qué está activo

Configurado vía GitHub (Settings → Branches → `main`):

- **PR obligatorio antes de mergear** — nadie puede hacer `git push origin main`
  directo, ni siquiera un admin del repo. El único camino a `main` es un
  Pull Request.
- **CI debe pasar** — el PR no se puede mergear hasta que los 6 checks de
  `.github/workflows/ci.yml` estén en verde:
  `Backend / orders-service`, `Backend / inventory-service`,
  `Backend / shipping-service`, `Backend / notification-service`,
  `Frontend`, `Landing`.
- **Rama al día** ("strict" status checks) — si `main` avanzó después de
  que abriste el PR, hay que actualizar la rama (merge o rebase) antes de
  mergear, para que el CI corra contra el código final real, no contra una
  versión vieja.
- **Aplica a administradores también** (`enforce_admins`) — decisión
  explícita del equipo: ni el dueño del repo puede saltarse el gate, ni
  siquiera "por esta vez". Si hace falta un hotfix urgente, igual pasa por
  PR — simplemente se prioriza revisarlo/mergearlo rápido.
- **0 aprobaciones humanas requeridas** — pensado para equipo chico/solo
  developer: no bloquea el merge esperando a que otra persona apruebe,
  pero **sí** exige que exista el PR y que el CI pase. Cuando el equipo
  crezca, subir `required_approving_review_count` a 1+ en la misma
  configuración de branch protection.
- **No se permite force-push ni borrar `main`.**
- **Conversaciones del PR deben quedar resueltas** antes de mergear.

## Qué NO cambia

- El autodeploy de Render/Vercel (si se usa en el futuro) sigue
  disparándose por push a `main` — pero como ahora es imposible pushear
  directo a `main`, en la práctica el autodeploy solo corre después de que
  un PR pasó el CI y se mergeó. Esto es lo que cierra el gap que señalaba
  `aidlc-docs/design-artifacts/ADR/ADR-003-no-cicd-platform-native-autodeploy.md`
  ("no hay gate automático de tests antes de desplegar").
- El backend en VPS se despliega manualmente (`docker compose -f
  docker-compose.prod.yml up -d --build`, ver
  [Despliegue-VPS.md](Despliegue-VPS.md)), no por autodeploy — pero seguís
  queriendo que el código que llega a `main` ya haya pasado CI antes de
  desplegarlo manualmente.

## Flujo día a día

```bash
git checkout -b fix/lo-que-sea
# ... cambios ...
git push -u origin fix/lo-que-sea
gh pr create --fill
# esperar a que el CI corra (o revisarlo en la pestaña Checks del PR)
gh pr merge --squash   # una vez el CI esté verde
```

Si estás trabajando solo, no hace falta esperar aprobación de nadie — el
PR existe para que el CI corra y quede un registro claro de qué cambió y
por qué, no como trámite burocrático.

## Reconfigurar la regla

Si en algún momento hay que ajustar esto (agregar aprobaciones requeridas,
sumar un check nuevo del CI, etc.), se hace desde
`https://github.com/jhonabruzzi278/logify/settings/branches`, o vía API:

```bash
gh api repos/jhonabruzzi278/logify/branches/main/protection
```

para ver la configuración actual.
