/** Fallback de Suspense mientras se descarga el chunk de una ruta (code-splitting por página). */
export function PageLoader() {
  return (
    <div className="flex h-full min-h-[40vh] w-full items-center justify-center">
      <div
        role="status"
        aria-label="Cargando página"
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
      />
    </div>
  );
}
