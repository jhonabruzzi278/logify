import { useEffect, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { checkEmailExists } from "@/lib/local-jwt-auth";

export type EmailAvailabilityStatus = "idle" | "checking" | "existing" | "new";

// Detecta si un correo ya tiene cuenta en Logify mientras se escribe --
// "Agregar usuario" lo usa para ocultar el campo de contraseña cuando esa
// persona ya inicia sesión de forma independiente con la que ya tiene.
// `enabled` pausa la detección cuando el formulario de alta está cerrado.
export function useEmailAvailabilityCheck(email: string, token: string, enabled: boolean): EmailAvailabilityStatus {
  const debouncedEmail = useDebounce(email, 500);
  const [status, setStatus] = useState<EmailAvailabilityStatus>("idle");

  useEffect(() => {
    const trimmed = debouncedEmail.trim();
    if (!enabled || !trimmed.includes("@")) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("checking");
    checkEmailExists(token, trimmed)
      .then((exists) => { if (!cancelled) setStatus(exists ? "existing" : "new"); })
      .catch(() => { if (!cancelled) setStatus("idle"); });
    return () => { cancelled = true; };
  }, [debouncedEmail, enabled, token]);

  return status;
}
