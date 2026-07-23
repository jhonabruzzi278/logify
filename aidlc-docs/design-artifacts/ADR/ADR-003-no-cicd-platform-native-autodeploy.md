# ADR-003: Sin pipeline de CI/CD — autodeploy nativo de plataforma

**Status:** Aceptado (implementado) — ⚠️ reversión de una decisión anterior
**Fecha:** commit `6018f89` ("chore: eliminar infraestructura AWS/Terraform y CI/CD asociado")

## Contexto

El proyecto tuvo previamente infraestructura de CI/CD junto con infraestructura AWS/Terraform (evidenciado por el mensaje del commit que las elimina a ambas juntas). En algún punto se decidió remover ambas.

## Decisión

Eliminar el pipeline de CI/CD (`.github/workflows/`) y la infraestructura AWS/Terraform asociada. El despliegue actual depende exclusivamente del autodeploy nativo de Render y Vercel al detectar un push a `main` en GitHub — documentado explícitamente en `RENDER_DEPLOY.md` Parte G: *"No necesitas GitHub Actions para esto."*

## Consecuencias

**Positivas:**
- Menos infraestructura que mantener y depurar — relevante para un equipo pequeño en fase de desarrollo activo.
- Reduce/elimina el costo y la complejidad de gestionar credenciales de AWS y estado de Terraform.
- Tiempo de "commit a producción" más simple de razonar (push → autodeploy), sin un pipeline intermedio que pueda romperse por sí mismo.

**Negativas — gaps reales de cara a Operations:**
- **No hay gate automático de tests antes de desplegar.** Los 164-212 tests existentes (ver discrepancia en `testing/TEST_COVERAGE_REPORT.md`) corren solo si un desarrollador los ejecuta manualmente localmente antes de hacer push — nada impide desplegar código que rompe tests.
- Sin lint/typecheck automatizado en PR — el repo tiene scripts `typecheck`/`lint` (`tsc --noEmit`) en el Frontend pero no hay evidencia de que se ejecuten automáticamente.
- Sin build de verificación previo al deploy — un error de build se descubre en producción (o en el dashboard de Render/Vercel), no antes del merge.
- Múltiples branches activas (`develop`, `darlette`, `victor`) sin evidencia de protección de rama ni revisión de PR obligatoria.

## Alternativas consideradas

⚠️ No documentadas. Dado que el objetivo de costo es $0/mes, GitHub Actions con minutos gratuitos (2000 min/mes en repos privados, ilimitado en públicos) sería una opción de bajo costo para al menos correr tests antes del autodeploy — no requiere reintroducir AWS/Terraform, que parece haber sido el verdadero motivo del retiro.

## Recomendación (no una decisión tomada, sugerencia de esta auditoría)

Considerar reintroducir un pipeline mínimo (solo GitHub Actions, sin AWS/Terraform) que ejecute `npm test` en los 4 servicios backend + frontend en cada PR/push a `main`, como gate previo al autodeploy de Render/Vercel — esto cerraría la brecha más barata de las identificadas en `deployment/DEPLOYMENT_CHECKLIST.md` antes de considerar el sistema apto para tráfico real.
