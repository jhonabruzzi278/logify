import { useEffect, useState } from "react";
import { fetchImageObjectUrl } from "@/lib/api-blob";

interface UseAuthImageResult {
  url: string | null;
  loading: boolean;
  error: string | null;
}

/** Carga una imagen autenticada (Authorization: Bearer) como blob object URL. Pasa `null` para no cargar. */
export function useAuthImage(path: string | null): UseAuthImageResult {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);

    fetchImageObjectUrl(path)
      .then((result) => {
        if (cancelled) return;
        objectUrl = result;
        setUrl(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar la imagen");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return { url, loading, error };
}
