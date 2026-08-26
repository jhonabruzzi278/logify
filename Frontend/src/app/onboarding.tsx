import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { PageLoader } from "@/components/common/page-loader";
import { getOnboarding } from "@/lib/onboarding-service";

export function RequireCompletedOnboarding() {
  const { session } = useAuth();
  const [pending, setPending] = useState(session?.role === "owner");
  const [required, setRequired] = useState(false);

  useEffect(() => {
    if (session?.role !== "owner") {
      setPending(false);
      setRequired(false);
      return;
    }
    let cancelled = false;
    void getOnboarding()
      .then((result) => {
        if (!cancelled) setRequired(!result.completed);
      })
      .catch(() => {
        // Una falla de comprobación no debe bloquear a un tenant ya operativo.
        if (!cancelled) setRequired(false);
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => { cancelled = true; };
  }, [session?.role]);

  if (pending) return <PageLoader />;
  if (required) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
