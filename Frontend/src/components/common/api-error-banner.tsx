import { AlertTriangle, RefreshCw } from "lucide-react";

interface ApiErrorBannerProps {
  error: string | null;
  onRetry?: () => void;
}

export function ApiErrorBanner({ error, onRetry }: ApiErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
      <p className="flex-1 text-xs text-red-600">{error}</p>
      {onRetry && (
        <button type="button"
          onClick={onRetry}
          className="flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
        >
          <RefreshCw className="h-3 w-3" /> Reintentar
        </button>
      )}
    </div>
  );
}
