# 2026-08-07 — Clientes B2B creados con `customerType` incorrecto quedan invisibles

## Resumen

Al probar el flujo completo (crear cuenta → login → POS → cambiar a modo B2B
→ crear cliente empresa), el cliente "Distribuidora Los Andes" se guardó
correctamente en la base de datos (confirmado vía API), pero **no aparecía
en la lista de clientes B2B** — la vista seguía mostrando "0 clientes".

## Causa raíz

`Frontend/src/pages/customers-page.tsx`:

```ts
const [form, setForm] = useState({ ..., customerType: segmentType, ... });
```

`form.customerType` se inicializa **una sola vez**, con el `segmentType`
vigente en el primer render del componente. Si el usuario cambia de modo
(B2C → B2B) *después* de ese mount y abre "Nuevo cliente" sin haber cerrado
antes el diálogo una vez en ese modo (que sí resetea `form` con el
`segmentType` correcto vía `onOpenChange`), `form.customerType` sigue con el
valor viejo ("individual").

El diálogo mostraba correctamente la etiqueta "Empresa (según modo B2B
activo)" — un texto derivado de `segmentType` en cada render — mientras que
el campo real que se enviaba al backend (`form.customerType`) seguía
desactualizado. El formulario mentía visualmente sobre qué iba a guardar.

El filtro de la lista (`customers.filter(c => c.customerType === segmentType)`)
es correcto — el cliente sí se creó, solo que con el tipo equivocado, y por
lo tanto no matchea el filtro de la vista en la que se creó.

## Impacto

- Cualquier negocio que recién activa modo B2B y crea su primer cliente
  empresa (el camino más común: activar el modo y crear el cliente en el
  mismo flujo) lo pierde de vista — el cliente existe pero parece no haberse
  guardado. Riesgo de duplicados si el usuario reintenta creándolo de nuevo.

## Remediación aplicada

- `customers-page.tsx`: nuevo `useEffect` que sincroniza
  `form.customerType` con `segmentType` cada vez que cambia el modo
  (excepto mientras se edita un cliente existente, para no pisar su tipo
  real).
- Se eliminó el registro mal guardado creado durante la prueba
  (`Distribuidora Los Andes`, id 2) para no dejar basura de QA en el tenant
  de prueba.
- `Frontend/package.json` versión `1.0.1` → `1.0.2`.

## Seguimiento

- [ ] Agregar un test de componente (RTL) para `CustomersPage` que cubra:
      cambiar de modo → abrir diálogo → el campo enviado coincide con el
      modo activo. No se agregó en esta sesión por alcance/tiempo.
- [ ] Revisar si otros formularios del dashboard tienen el mismo patrón de
      `useState(() => algo_derivado_de_un_hook_reactivo)` sin sync — es un
      antipatrón fácil de repetir (`useState` congela el valor inicial, no
      seguí buscando otras instancias por límite de tiempo de esta sesión).

🤖 Generado con [Claude Code](https://claude.com/claude-code)
