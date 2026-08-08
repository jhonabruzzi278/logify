import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Logify ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#1A3142]">
              <span className="text-xl font-bold text-white">!</span>
            </div>
            <h1 className="text-lg font-bold text-foreground">Error inesperado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ocurrio un error inesperado en la aplicacion. Intenta recargar la pagina.
            </p>
            {this.state.error && (
              <details className="mt-3 text-left">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Detalles del error
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-[10px] text-foreground">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <button type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="mt-5 rounded bg-[#4B98CF] px-4 py-2 text-sm font-bold text-white hover:bg-[#346384]"
            >
              Recargar pagina
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
