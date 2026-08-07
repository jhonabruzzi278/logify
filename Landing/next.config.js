// El build de producción usa webpack (ver "build" en package.json: `next build --webpack`).
// Turbopack (default de Next 16 para `next build`) compila sin errores pero el bundle
// resultante nunca hidrata en el cliente -- SSR se ve bien, pero ningún onClick/onSubmit
// se conecta (formularios caen a submit HTML nativo, sin logs de error). Reproducido en
// local limpio (build+start) comparando Turbopack vs webpack; ver
// aidlc-docs/operations/POST_MORTEMS/2026-08-07-landing-hidratacion-rota-turbopack.md
/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
};

module.exports = nextConfig;
