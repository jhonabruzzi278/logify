# Colección Postman

`logify-postman-collection.json` conserva los flujos CRUD y Saga originales
para ejecución local contra `http://localhost:8080`.

## Estado actual

- La API es multi-tenant y las rutas protegidas requieren JWT.
- En producción, el endpoint base es `https://api.logify.cl` y debe enviarse
  `X-Tenant-Slug` con el slug correspondiente.
- La colección no debe ejecutarse contra producción: crea, modifica y elimina
  datos de prueba, y varios escenarios asumen el tenant local semilla.
- La referencia completa y vigente de endpoints está en
  [`wiki/API-Reference.md`](../../wiki/API-Reference.md).

Para pruebas automatizadas actuales se usan Jest/Supertest, Vitest y
Playwright; consulta [`wiki/Pruebas.md`](../../wiki/Pruebas.md).
