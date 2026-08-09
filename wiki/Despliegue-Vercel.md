# Despliegue de Frontend y Landing en Vercel

Frontend (React/Vite) y Landing (Next.js) viven en el mismo repo
(`Frontend/`, `Landing/`) pero se despliegan como **dos proyectos Vercel
separados**, ambos conectados al mismo repo de GitHub con distinto
"Root Directory". El backend NO va acá — ver
[Despliegue-VPS.md](Despliegue-VPS.md).

## Proyectos actuales

| Proyecto Vercel | Root Directory | Framework | Dominio(s) |
|---|---|---|---|
| `logify-sistema` | `Frontend` | Vite | `app.logify.cl` |
| `logify-landing` | `Landing` | Next.js | `logify.cl`, `www.logify.cl` |

Ambos en la cuenta de Vercel del dueño del repo (`jhonabruzzi278`), team
`jonathans-projects-8b9c57cf` — importante: la integración Git de Vercel
necesita que la cuenta que crea el proyecto tenga acceso admin/write al
repo de GitHub. Si el proyecto se crea desde una cuenta de Vercel distinta
(otro team, otro usuario), `vercel git connect` falla con
`"You need admin or write access to the repository"` aunque el GitHub App
de Vercel esté instalado — la cuenta de Vercel tiene que ser la misma
persona (o tener collaborator access) en GitHub.

## ⚠️ Gotcha real: el campo `framework` del proyecto

Si creás un proyecto Vercel por API/CLI (`vercel project add` +
`PATCH /v9/projects/{id}` para fijar `rootDirectory`) en vez de por el
flujo de importación del dashboard, **el campo `framework` del proyecto
puede quedar `null`** aunque Vercel detecte y buildee Next.js/Vite
correctamente durante el build (`vercel build` hace su propia detección
por `package.json`, independiente del campo guardado en el proyecto).

Con `framework: null`, el build compila perfecto pero **el dominio sirve
404 (`NOT_FOUND`) en todas las rutas** — la plataforma no sabe cómo
interpretar el output para servirlo. Se manifiesta igual en la app
`.vercel.app` del proyecto, no solo en el dominio custom, así que no es
un problema de DNS/alias (fácil de confundir con eso — perdimos bastante
tiempo en eso antes de encontrar la causa real).

**Fix:** setear el framework explícitamente después de crear el proyecto:

```bash
curl -X PATCH "https://api.vercel.com/v9/projects/<project>?teamId=<teamId>" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"framework":"nextjs"}'   # o "vite", segun corresponda
```

Si usás el flujo normal del dashboard (Import Project → elegís el repo
→ Vercel detecta todo), esto no pasa — el gotcha es específico de crear
el proyecto por API/CLI sin pasar por el detector de importación.

## Variables de entorno

| Proyecto | Variable | Valor | Environments |
|---|---|---|---|
| `logify-sistema` | `VITE_API_BASE_URL` | `https://api.logify.cl` | Production, Preview |

`Landing` no necesita variables de entorno (contenido estático, no llama
al backend).

## Seguridad (deployment protection)

Ambos proyectos tienen, por defecto de la cuenta:

- **SSO Protection** (`all_except_custom_domains`) — los previews
  (`*.vercel.app`) requieren login con la cuenta de Vercel; solo los
  dominios custom de producción (`app.logify.cl`, `logify.cl`,
  `www.logify.cl`) son públicos.
- **Git Fork Protection** — un PR desde un fork no tiene acceso a las
  env vars durante el build (evita leak de `VITE_API_BASE_URL` u otras
  variables sensibles vía un PR malicioso).

`logify-sistema/Frontend/vercel.json` además define headers de seguridad
explícitos (CSP, HSTS, X-Frame-Options, etc.) y el rewrite SPA estándar
(`/(.*) → /index.html`, necesario porque es una app de una sola página
con `react-router-dom` — sin esto, refrescar en cualquier ruta que no
sea `/` da 404).

## Redeploy

Como `main` está protegida (ver [Flujo-Git.md](Flujo-Git.md)), el único
camino a producción es: PR → CI verde → merge → Vercel autodetecta el
push a `main` vía el webhook de GitHub y redespliega solo. No hace falta
tocar nada manual acá. El backend también se despliega automáticamente al VPS
después de que la CI de `main` termina en verde.

## Pendiente conocido

- **`og-image.png`** no existe todavía en `Frontend/public/` ni
  `Landing/public/` — ambos sitios referencian `/og-image.png` en sus
  metadatos Open Graph (para el preview al compartir el link en
  WhatsApp/LinkedIn/Facebook), pero el archivo real (1200x630 PNG/JPG)
  nunca se agregó. Hoy que el sitio es público esto es visible — el link
  compartido no muestra imagen de preview.
