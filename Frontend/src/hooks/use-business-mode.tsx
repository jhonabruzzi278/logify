import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export type BusinessMode = "b2b" | "b2c";

interface BusinessModeContextValue {
  mode: BusinessMode;
  setMode: (mode: BusinessMode) => void;
  toggleMode: () => void;
}

const STORAGE_KEY = "logify-business-mode";
const BusinessModeContext = createContext<BusinessModeContextValue | null>(null);

function readStoredMode(): BusinessMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "b2c" ? "b2c" : "b2b";
  } catch {
    return "b2b";
  }
}

export function BusinessModeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<BusinessMode>(readStoredMode);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo<BusinessModeContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode: () => setMode((current) => (current === "b2b" ? "b2c" : "b2b")),
    }),
    [mode]
  );

  return <BusinessModeContext.Provider value={value}>{children}</BusinessModeContext.Provider>;
}

export function useBusinessMode() {
  const ctx = useContext(BusinessModeContext);
  if (!ctx) throw new Error("useBusinessMode debe usarse dentro de BusinessModeProvider");
  return ctx;
}
