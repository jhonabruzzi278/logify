# Auditoría y remediación de producción — 2026-08-25

## Resultado

La aplicación quedó desplegada y operativa en el commit
`c1fdd055c8478c848e647e52de9d5596c6e50bee` después de integrar el PR #79.
Los bloqueantes de aplicación, backups y acceso remoto fueron corregidos. Las
tareas restantes requieren una decisión operativa: copia externa de datos,
rotación de la contraseña root y ventana de actualización/reinicio.

## Evidencia final

- `https://api.logify.cl/healthz`: HTTP 200.
- `https://status.logify.cl`: HTTP 200.
- `https://logify.cl`: HTTP 200.
- `https://app.logify.cl`: HTTP 200 y redirección funcional a `/login`.
- Certificado de `api.logify.cl`: Let's Encrypt, válido hasta 2026-11-04.
- Postgres, cuatro microservicios y Uptime Kuma: `healthy`.
- Logs posteriores al despliegue: sin coincidencias `uncaught`, `unhandled`,
  `fatal` o `panic`.
- Disco raíz: 9% utilizado; memoria disponible: aproximadamente 2.9 GiB.

Smoke tests sin credenciales:

| Comprobación | Resultado |
|---|---:|
| Orders sin autenticación | HTTP 401 |
| Preflight desde `app.logify.cl` | HTTP 204 |
| Preflight desde origen no permitido | HTTP 403 |
| Signup público | HTTP 503, `SIGNUP_DISABLED` |

La landing desplegada muestra “Solicitar acceso” y ya no promete una prueba
gratis incompatible con el registro pausado. La app carga el formulario de
login y los enlaces de soporte sin errores de consola.

## Cambios de aplicación

- Signup controlado mediante `SIGNUP_ENABLED`: desactivado por defecto en
  producción y habilitado por defecto solo en desarrollo local.
- CORS devuelve un 403 JSON controlado en lugar de propagar un 500.
- Script de backup con archivos temporales, validación gzip y movimiento
  atómico.
- Instalador post-clone corregido para cron, directorio y log escribibles.
- Falsos positivos conocidos de Gitleaks documentados mediante fingerprints.
- CTA, registro, precios, FAQ y contactos alineados con activación asistida.
- Cobertura de `Backend/shared/security.js` incorporada al reporte real de
  Jest/SonarCloud.

## Validación de código y CI

- Orders: 214/214.
- Inventory: 122/122.
- Shipping: 60/60.
- Notification: 68/68.
- Frontend: 167/167, typecheck y build/PWA.
- Landing: build exitoso.
- `npm audit`: cero vulnerabilidades en los seis proyectos instalados.
- React Doctor: sin hallazgos nuevos en Frontend ni Landing.
- Docker Compose de producción: configuración válida.
- PR #79 y `main`: CI, Security, CodeQL, Trivy, Gitleaks, SonarCloud y Vercel en
  verde. El Quality Gate de cobertura nueva superó el mínimo del 80%.

## Backups

El cron llevaba 19 días sin producir copias por dos causas: `backup.sh` no era
ejecutable y el log apuntaba a `/var/log`, no escribible por `deploy`.

Remediación:

- `Backend/postgres/backup.sh` versionado como ejecutable y modo operativo
  `750 deploy:deploy`.
- Cron de `deploy`:

  ```cron
  0 3 * * * cd /home/deploy/logify && /home/deploy/logify/Backend/postgres/backup.sh >> /home/deploy/logify/Backend/postgres/backups/backup.log 2>&1
  ```

- Dumps del 2026-08-25 generados para `orders_db`, `inventory_db`,
  `shipping_db` y `notification_db`; todos pasaron `gzip -t`.
- Restauración real en un contenedor PostgreSQL 15 temporal con
  `ON_ERROR_STOP=1`: 8, 6, 2 y 2 tablas públicas respectivamente.
- El contenedor temporal se eliminó al terminar.

Pendiente: automatizar una copia externa cifrada. Los dumps pueden contener
datos personales o comerciales y no deben copiarse a equipos o servicios sin
autorización y controles de acceso explícitos.

## Seguridad del VPS

- Llave existente instalada y probada para `deploy`.
- Política efectiva de SSH:
  - puerto 12587;
  - `PasswordAuthentication no`;
  - `KbdInteractiveAuthentication no`;
  - `PermitRootLogin prohibit-password` (aparece como `without-password` en
    `sshd -T`);
  - `X11Forwarding no`;
  - `MaxAuthTries 3`.
- Política cargada desde
  `/etc/ssh/sshd_config.d/00-logify-hardening.conf` para preceder a cloud-init.
- Sesiones nuevas de `deploy` y root por llave verificadas tras recargar SSH.
- Fail2ban instalado, habilitado y activo para `sshd` en el puerto 12587.
- Regla UFW `OpenSSH`/22 retirada; quedan 12587, 80 y 443 para IPv4/IPv6.
- `reset-db.sh`, que truncaba las cuatro bases, fue retirado del repositorio y
  conservado de forma recuperable en
  `/root/logify-quarantine/reset-db.sh.2026-08-25`, modo `600 root:root`.

## Pendientes operativos

1. Cambiar o bloquear la contraseña root compartida durante la intervención.
   Aunque SSH por contraseña ya está desactivado, la credencial no debe seguir
   vigente para consola u otros mecanismos locales.
2. Aprobar un destino seguro y automatizar la segunda copia de backups.
3. Programar una ventana: `apt` informa 20 paquetes actualizables y el host
   requiere reinicio para pasar del kernel `5.15.0-187` al `5.15.0-190`.
4. Después del reinicio, repetir acceso SSH, `docker compose ps`, `/healthz`,
   endpoints web y los cuatro smoke tests HTTP.
5. Añadir alerta por antigüedad del último dump, además de disco, memoria y TLS.
6. Hacer obligatorio el contexto externo de SonarCloud en branch protection.
7. Ejecutar el login documentado solo con autorización explícita para enviar
   esas credenciales al endpoint de producción; esta auditoría no las transmitió.

