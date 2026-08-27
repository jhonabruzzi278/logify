# 2026-08-27 — Clerk autenticaba al usuario, pero la API rechazaba la sesión por `tenant_id` sin interpolar

## Resumen

Durante la validación E2E del onboarding central se creó correctamente una
empresa, su usuario, la Organization y la Organization Membership en Clerk.
Clerk aceptaba las credenciales y mantenía una sesión activa, pero Logify
redirigía nuevamente a `/login` con el mensaje:

```text
Tu sesión expiró. Vuelve a iniciar sesión.
```

La llamada real que fallaba era `GET https://api.logify.cl/api/onboarding`,
con `401` y el mensaje del backend:

```text
Sesion invalida, inicia sesion de nuevo
```

El problema no estaba en la contraseña, la sesión, la membership ni los
metadatos guardados. El JWT Template `logify-api` usaba un nombre de shortcode
incorrecto para leer los metadatos de la Organization.

## Impacto

- Afectaba a los usuarios autenticados mediante Clerk cuyo tenant debía
  resolverse desde `Organization.publicMetadata`, incluido el owner recién
  creado por el onboarding público.
- El alta terminaba y los recursos quedaban creados correctamente, pero el
  cliente nuevo no podía entrar a la aplicación.
- Clerk mostraba el inicio de sesión como exitoso. Esto podía confundir el
  diagnóstico y hacer parecer que el problema era una cookie o una contraseña.
- El login legacy con JWT propio no dependía de este template y no estaba
  afectado por esta causa concreta.

No se identificaron credenciales filtradas ni acceso cross-tenant. El backend
rechazó el token porque no contenía un `tenant_id` utilizable, que es el
comportamiento seguro esperado.

## Causa raíz

El template estaba configurado así:

```json
{
  "name": "{{user.first_name}} {{user.last_name}}",
  "role": "{{org_membership.public_metadata.role}}",
  "username": "{{org_membership.public_metadata.username}}",
  "tenant_id": "{{organization.public_metadata.tenant_id}}",
  "tenant_slug": "{{organization.public_metadata.tenant_slug}}"
}
```

Para claims asociados a la Organization activa, Clerk usa el prefijo `org`, no
`organization`. El dashboard aceptó el JSON, pero al generar el token dejó los
dos valores inválidos como texto literal:

```json
{
  "tenant_id": "{{organization.public_metadata.tenant_id}}",
  "tenant_slug": "{{organization.public_metadata.tenant_slug}}"
}
```

`Backend/shared/clerk-auth.js` convierte `tenant_id` con `Number(...)`. La
expresión literal produce `NaN`; posteriormente `requireTenant`/RLS no puede
establecer un tenant entero y responde `401`.

El template correcto es:

```json
{
  "name": "{{user.first_name}} {{user.last_name}}",
  "role": "{{org_membership.public_metadata.role}}",
  "username": "{{org_membership.public_metadata.username}}",
  "tenant_id": "{{org.public_metadata.tenant_id}}",
  "tenant_slug": "{{org.public_metadata.tenant_slug}}"
}
```

## Factores contribuyentes

1. La primera versión del checklist de ADR-004 también documentaba
   `organization.public_metadata`, por lo que la configuración manual siguió
   una instrucción incorrecta del propio repositorio.
2. La configuración del dashboard y el código viven en sistemas distintos;
   los tests unitarios podían simular claims válidos sin comprobar el JWT real
   emitido por la instancia de producción.
3. El frontend convertía cualquier `401/403` en "sesión expirada", ocultando
   si el backend había recibido un token inválido, expirado o sin tenant.
4. Activar la Organization y forzar un token nuevo eran cambios necesarios,
   pero no podían corregir un shortcode inválido. Esto prolongó el diagnóstico.

## Línea de tiempo

| Cuándo | Evento |
|---|---|
| 2026-08-26 | Onboarding E2E crea la cuenta QA, tenant `2`, Organization y membership con sus metadatos. |
| 2026-08-26 | Clerk autentica al usuario, pero `/api/onboarding` responde `401`. |
| 2026-08-26 a 2026-08-27 | Se asegura la activación de la primera Organization y se fuerza `getToken({ template: "logify-api", organizationId, skipCache: true })`. El `401` persiste. |
| 2026-08-27 13:05 UTC | Diagnóstico temporal confirma que membership y Organization tienen metadatos válidos, pero el JWT contiene los placeholders literales. |
| 2026-08-27 13:08 UTC | Se cambia el template de `organization.public_metadata.*` a `org.public_metadata.*`. |
| 2026-08-27 13:08 UTC | Prueba E2E vuelve a cargar `app.logify.cl`, obtiene `tenant_id: 2`, la API responde correctamente y la navegación termina en `/dashboard`. |
| 2026-08-27 | Se fusiona el retiro de los logs temporales de diagnóstico en el PR #98. |

## Remediación aplicada

- Se corrigieron los dos shortcodes del JWT Template `logify-api` en la
  instancia de producción de Clerk.
- El frontend activa una Organization antes de solicitar el token.
- `getToken` recibe el `organizationId` explícito y `skipCache: true` para no
  reutilizar durante su TTL un token emitido antes del cambio de Organization.
- Se validó el flujo real con `jonathanguerrabs@gmail.com`: sesión Clerk,
  token con `tenant_id: 2`, respuesta válida de `/api/onboarding` y llegada a
  `https://app.logify.cl/dashboard` sin subdominio.
- Se retiró la instrumentación temporal después de identificar la causa.
- Se corrigió el checklist de ADR-004 para que futuras instancias usen `org`.

## Procedimiento de diagnóstico si vuelve a ocurrir

1. Confirmar si Clerk considera al usuario autenticado. El mensaje "already
   signed in" significa que repetir `signIn.create` no resolverá el problema.
2. Confirmar que existe exactamente la Organization esperada y que contiene
   `publicMetadata.tenant_id` y `publicMetadata.tenant_slug`.
3. Confirmar que la membership tiene `publicMetadata.role` y
   `publicMetadata.username`.
4. Generar un token nuevo después de activar la Organization y decodificar
   únicamente el payload para inspeccionar estos cuatro claims. Nunca registrar
   ni copiar el JWT completo.
5. Si un claim contiene `{{...}}` literalmente, revisar el shortcode en el
   dashboard. Para Organization se debe usar `org.*`; para membership,
   `org_membership.*`.
6. Probar `/api/onboarding` con el token nuevo. Un `401` con "Sesion invalida"
   apunta a tenant ausente/no numérico; "Token invalido" apunta a firma,
   issuer, secreto o JWKS.
7. Terminar con una prueba en un navegador limpio que confirme la URL final
   `https://app.logify.cl/dashboard` y ausencia de errores de red/autenticación.

## Acciones preventivas

- [x] Corregir ADR-004 y dejar el JSON canónico del template en el repositorio.
- [x] Mantener activación explícita de Organization y refresh sin caché.
- [x] Agregar cobertura unitaria para restauración de sesión y login con
      `organizationId` explícito.
- [ ] Agregar un smoke test programado que genere un JWT real de una cuenta QA,
      verifique que ningún claim contenga `{{` y consulte `/api/onboarding`.
- [ ] Validar en backend que `tenant_id` sea un entero finito inmediatamente
      después de mapear el payload de Clerk y registrar solo el motivo seguro
      del rechazo, sin token ni datos personales.
- [ ] Mantener un procedimiento de promoción/rollback para los cambios manuales
      del dashboard de Clerk, porque no forman parte del historial Git.

