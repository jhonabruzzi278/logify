# Versionado — SemVer + Conventional Commits

Logify usa una **versión única de repositorio** (no una por microservicio)
siguiendo [Versionado Semántico](https://semver.org/lang/es/)
(`MAJOR.MINOR.PATCH`), automatizada con
[release-please](https://github.com/googleapis/release-please) vía
`.github/workflows/release-please.yml`.

La versión actual y el historial completo viven en
[`CHANGELOG.md`](../CHANGELOG.md). El repositorio parte de **`v1.0.0`**
(primera versión estable en producción).

## Cómo se decide el número de versión

release-please lee el título/mensaje de cada commit que llega a `main`
(los merges se hacen con `gh pr merge --squash`, así que lo que importa es
el **título del PR** — ver [Flujo-Git.md](Flujo-Git.md)) y lo interpreta
como [Conventional Commits](https://www.conventionalcommits.org/es/):

| Prefijo del commit/PR | Efecto en la versión | Ejemplo |
|---|---|---|
| `fix: ...` | `PATCH` (1.0.0 → 1.0.1) | `fix: corrige generación de QR` |
| `feat: ...` | `MINOR` (1.0.1 → 1.1.0) | `feat(landing): rediseño de tema claro/oscuro` |
| `feat!: ...` o `fix!: ...` (o pie `BREAKING CHANGE:`) | `MAJOR` (1.1.0 → 2.0.0) | `feat!: elimina endpoint /v1/legacy` |
| `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `build:` | No cambia versión, no aparece en el changelog público | `docs: actualiza wiki` |
| `security: ...` | `PATCH`, aparece en sección "Security" | `security: hardening DevSecOps` |

El `scope` entre paréntesis (`feat(landing): ...`, `fix(frontend): ...`) es
opcional y solo se usa como contexto, no afecta el cálculo de versión.

## Flujo de una release

1. Se mergea a `main` uno o más PRs con commits `feat:`/`fix:`/etc.
2. El workflow **Release Please** corre en cada push a `main` y abre (o
   actualiza) automáticamente un **PR de release** llamado
   `chore(main): release X.Y.Z` con:
   - `CHANGELOG.md` actualizado con las entradas nuevas agrupadas por tipo.
   - `.release-please-manifest.json` con el número de versión nuevo.
3. Ese PR de release se revisa y se mergea igual que cualquier otro
   (pasa por CI, requiere estar al día con `main`).
4. Al mergear el PR de release, release-please crea automáticamente:
   - El **tag git** `vX.Y.Z`.
   - Un **GitHub Release** con las notas generadas del `CHANGELOG.md`.

No hace falta taggear a mano ni editar el changelog manualmente — el único
paso humano es escribir el mensaje del commit/PR con el prefijo correcto y
aprobar el PR de release cuando se quiera publicar esa versión.

## Configuración

- [`release-please-config.json`](../release-please-config.json) — tipo de
  release (`simple`, un solo paquete en la raíz `.`), secciones del
  changelog y qué tipos de commit se muestran.
- [`.release-please-manifest.json`](../.release-please-manifest.json) —
  versión actual rastreada por la herramienta.
- [`.github/workflows/release-please.yml`](../.github/workflows/release-please.yml) —
  workflow que corre en cada push a `main`.

## Versiones internas de cada servicio

Los `package.json` de `Frontend/`, `Landing/` y cada servicio en
`Backend/*/` mantienen su propio campo `"version"` interno (uso de npm/
Docker tags puntuales), pero **no son la fuente de verdad del versionado
del proyecto** — esa es siempre el tag `vX.Y.Z` del repo y
[`CHANGELOG.md`](../CHANGELOG.md).

## Licencia

El software es propietario — ver [`LICENSE`](../LICENSE) en la raíz del
repo. Todos los derechos reservados; no está permitido su uso, copia,
modificación o distribución sin autorización previa y por escrito.
