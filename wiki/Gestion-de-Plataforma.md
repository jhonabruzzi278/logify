# Gestión de plataforma

`https://gestion.logify.cl` es el portal interno de Logify para observar la
plataforma completa. No pertenece a ningún tenant y no reutiliza los roles
`owner` o `admin` de las organizaciones cliente.

## Autorización

El frontend inicia sesión con Clerk. El backend verifica el JWT y compara el
claim inmutable `sub` con la lista de IDs configurada en:

```env
PLATFORM_ADMIN_CLERK_USER_IDS=user_xxx,user_yyy
```

La lista vive únicamente en el servidor/GitHub Secrets. `PLATFORM_ADMIN_KEY`
se conserva para automatizaciones server-to-server y nunca se entrega al
navegador.

## Activación del dominio

1. Agregar `gestion.logify.cl` como dominio del proyecto Vercel del Frontend.
2. Crear el registro DNS solicitado por Vercel.
3. Autorizar `https://gestion.logify.cl` en la instancia de Clerk.
4. Agregar el origen a `ALLOWED_ORIGINS` en el `.env` del VPS.
5. Crear el secret `PLATFORM_ADMIN_CLERK_USER_IDS` en GitHub.
6. Desplegar y comprobar `/api/platform/overview` con una sesión autorizada.

## Alcance inicial

- Resumen de organizaciones, pruebas, suscripciones activas y MRR registrado.
- Búsqueda y estado de organizaciones.
- Diagnóstico de configuración de Flow, Mercado Pago y Paddle sin exponer
  secretos.

La selección editable del proveedor se habilita cuando el billing service y
al menos un adaptador real estén disponibles. Cambiar el proveedor por defecto
solo debe afectar suscripciones nuevas; las existentes requieren una migración
explícita.
