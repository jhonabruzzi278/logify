# 2026-08-27 — 401 transitorio al renovar Clerk y cámara bloqueada en el POS

## Resumen

Después de corregir el JWT Template de Clerk, la consola de una sesión real
mostró dos señales distintas:

```text
GET /api/inventory/indicadores 401
Permissions policy violation: camera is not allowed in this document
```

Los diagnósticos de autenticación confirmaban una sola Organization activa y
claims válidos para `tenant_id`, `tenant_slug`, `role` y `username`. No se
registraron en este documento identificadores de Organization, correo ni datos
personales del usuario afectado.

## Impacto observado

- Chrome registró un `401` inicial al consultar indicadores de inventario.
- La vista de Inventario cargó correctamente en la prueba QA posterior.
- El lector de códigos de barras del POS no podía iniciar la cámara, porque la
  cabecera del portal la bloqueaba para todos los orígenes.
- No hubo evidencia de acceso cross-tenant ni de emisión de claims con el
  tenant equivocado.

## Diagnóstico del 401

El frontend reintenta una solicitud que recibe `401` o `403`: solicita un token
actualizado mediante el handler de Clerk, reemplaza el token del cliente y
repite la petición una vez. La consola del navegador conserva el primer `401`
aunque el reintento posterior responda correctamente.

La prueba unitaria `Frontend/src/lib/__tests__/api-client.test.ts` cubre este
comportamiento. La navegación QA a Inventario finalizó correctamente, por lo
que el evento observado es compatible con una renovación transitoria de token.
Esto no debe confundirse con el incidente de shortcodes: en este caso los
claims decodificados ya contenían un `tenant_id` numérico correcto.

Si la interfaz queda sin datos, redirige a `/login` o el segundo intento también
responde `401`, el incidente deja de ser transitorio. En ese caso se debe
capturar de forma segura el cuerpo de la segunda respuesta y revisar los logs
del inventory-service, sin copiar el JWT completo.

## Causa raíz del bloqueo de cámara

El POS usa `getUserMedia` a través del lector de códigos, pero las dos
configuraciones de entrega del frontend declaraban:

```text
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`camera=()` bloquea la cámara incluso para el propio documento. La política
correcta para esta funcionalidad es:

```text
Permissions-Policy: camera=(self), microphone=(), geolocation=()
```

Con ella, solo el portal del mismo origen puede solicitar la cámara. El usuario
todavía debe conceder el permiso del navegador; micrófono y ubicación continúan
bloqueados.

## Remediación y verificación

- Se actualizó `Frontend/vercel.json`, utilizado por el despliegue de Vercel.
- Se actualizó `Frontend/nginx.prod.conf` para mantener paridad si el frontend
  se sirve mediante Nginx.
- Se agregó una prueba de regresión que exige `camera=(self)` en ambas
  configuraciones y rechaza que reaparezca `camera=()`.
- Pasaron 26 pruebas dirigidas de autenticación y cabeceras.
- `npm run build` completó correctamente.
- La corrección y este registro se prepararon en el PR #100.

## Procedimiento de verificación en producción

1. Hacer una recarga forzada (`Ctrl+Shift+R`) o cerrar y abrir nuevamente la
   PWA para descartar el bundle almacenado por el service worker.
2. Confirmar que la respuesta de `https://app.logify.cl/pos` incluya
   `Permissions-Policy: camera=(self), microphone=(), geolocation=()`.
3. Iniciar sesión mediante la entrada única de `app.logify.cl`.
4. Abrir Inventario y confirmar que los indicadores se muestran. Un primer
   `401` seguido de una respuesta exitosa corresponde al refresh esperado.
5. Abrir el POS, activar el lector y conceder permiso de cámara. Confirmar que
   no aparece una nueva violación de Permissions Policy.

## Acciones preventivas

- [x] Mantener prueba de reintento del cliente ante `401`.
- [x] Cubrir la política de cámara de Vercel y Nginx con una prueba de regresión.
- [ ] Agregar telemetría segura para distinguir el primer intento del reintento
      sin registrar tokens ni claims personales.
- [ ] Incorporar el lector de cámara a la prueba manual de aceptación del POS.
