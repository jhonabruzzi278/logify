import { isRouteErrorResponse, useRouteError } from "react-router-dom";

/** errorElement de las rutas: cubre fallos de carga de chunk (deploy nuevo con una pestaña vieja abierta) y errores de render por ruta. */
export function RouteErrorFallback() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Error inesperado";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#172554]">
          <span className="text-xl font-bold text-white">!</span>
        </div>
        <h1 className="text-lg font-bold text-foreground">Error inesperado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocurrió un error al cargar esta página. Puede deberse a una nueva versión desplegada.
        </p>
        <details className="mt-3 text-left">
          <summary className="cursor-pointer text-xs text-muted-foreground">Detalles del error</summary>
          <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-[10px] text-foreground">{message}</pre>
        </details>
        <button type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded bg-[#2563EB] px-4 py-2 text-sm font-bold text-white hover:bg-[#1D4ED8]"
        >
          Recargar página
        </button>
      </div>
    </div>
  );
}
