import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock, MapPinned, PackageCheck, Truck, User } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { gsap } from "gsap";
import { getDefaultPathForRole, isPathAllowedForRole } from "@/app/access";
import { useAuth } from "@/app/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStaggerReveal } from "@/hooks/use-stagger-reveal";

const FEATURES = [
  { icon: Truck, text: "Seguimiento de despachos en tiempo real, desde bodega hasta la entrega." },
  { icon: PackageCheck, text: "Entregas validadas con código de pedido y RUT del receptor." },
  { icon: MapPinned, text: "Stock, pedidos y rutas sincronizados en un solo panel." },
];

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, login, loading, error } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const routeSvgRef = useRef<SVGSVGElement>(null);
  const featuresRef = useStaggerReveal<HTMLUListElement>(true);

  useEffect(() => {
    if (!routeSvgRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const paths = gsap.utils.toArray<SVGPathElement>(".route-path");
      const dots = gsap.utils.toArray<SVGCircleElement>(".route-dot");

      gsap.set(dots, { transformOrigin: "center", scale: 0, opacity: 0 });
      gsap.to(dots, { scale: 1, opacity: 1, duration: 0.5, stagger: 0.15, delay: 0.3, ease: "back.out(2)" });

      // Flujo continuo y sutil de las rutas punteadas, evocando trazabilidad en tiempo real.
      paths.forEach((path) => {
        gsap.to(path, { strokeDashoffset: -33, duration: 2.2, repeat: -1, ease: "none" });
      });
    }, routeSvgRef);

    return () => ctx.revert();
  }, []);

  const from = (location.state as { from?: string; deniedFrom?: string } | null)?.from;
  const deniedFrom = (location.state as { from?: string; deniedFrom?: string } | null)?.deniedFrom;

  if (session) {
    return <Navigate to={getDefaultPathForRole(session.role)} replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const nextSession = await login({ username: username.trim(), password });
      const target = from && isPathAllowedForRole(nextSession.role, from)
        ? from
        : getDefaultPathForRole(nextSession.role);
      navigate(target, { replace: true });
    } catch {
    } finally {
      setSubmitting(false);
    }
  }

  const busy = loading || submitting;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca — oculto en mobile */}
      <div className="relative hidden overflow-hidden bg-[#0F2036] lg:flex lg:flex-col lg:justify-between lg:p-14">
        <svg
          ref={routeSvgRef}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]"
          viewBox="0 0 600 800"
          fill="none"
          aria-hidden="true"
        >
          <path className="route-path" d="M-20 620 C 120 560, 180 460, 140 340 S 260 140, 420 180 S 560 60, 660 20" stroke="#6BB3E8" strokeWidth="2" strokeDasharray="1 10" strokeLinecap="round" />
          <path className="route-path" d="M-40 220 C 100 260, 160 180, 260 220 S 420 340, 520 300 S 640 400, 700 460" stroke="#6BB3E8" strokeWidth="2" strokeDasharray="1 10" strokeLinecap="round" />
          <circle className="route-dot" cx="140" cy="340" r="5" fill="#6BB3E8" />
          <circle className="route-dot" cx="420" cy="180" r="5" fill="#6BB3E8" />
          <circle className="route-dot" cx="260" cy="220" r="5" fill="#6BB3E8" />
          <circle className="route-dot" cx="520" cy="300" r="5" fill="#6BB3E8" />
        </svg>

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4B98CF]">
            <span className="text-lg font-bold text-white">S</span>
          </div>
          <span className="text-lg font-bold text-white">Logify</span>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-white">
            Control logístico para distribuidoras y almacenes
          </h2>
          <p className="mt-3 text-sm text-[#A9C1D9]">
            Del pedido a la entrega, sin planillas sueltas ni datos desincronizados.
          </p>

          <ul ref={featuresRef} className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10">
                  <Icon className="h-4 w-4 text-[#6BB3E8]" />
                </span>
                <span className="text-sm leading-relaxed text-[#D7E4F0]">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-[#6B85A3]">
          &copy; {new Date().getFullYear()} Logify &middot; Plataforma interna de operaciones
        </p>
      </div>

      {/* Panel de acceso */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1A3142]">
              <span className="text-lg font-bold text-white">S</span>
            </div>
            <span className="text-lg font-bold text-foreground">Logify</span>
          </div>

          <h1 className="text-2xl font-bold text-foreground">Bienvenido de vuelta</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ingresa tus credenciales para acceder a tu panel.
          </p>

          {deniedFrom ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              Tu cuenta no tiene acceso a <strong>{deniedFrom}</strong>. Inicia sesión con otro perfil.
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-xs font-semibold text-foreground">
                Usuario
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="nombre.usuario"
                  autoComplete="username"
                  autoFocus
                  disabled={busy}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold text-foreground">
                  Contraseña
                </label>
                <Link to="/forgot-password" className="text-xs font-medium text-[#4B98CF] hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={busy}
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={busy}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-input accent-[#4B98CF]" />
              Mantener sesión iniciada
            </label>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="h-11 w-full bg-[#4B98CF] text-sm font-bold hover:bg-[#346384]"
              disabled={busy || !username.trim() || !password.trim()}
            >
              {busy ? "Ingresando..." : "Iniciar sesión"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            ¿Problemas para ingresar?{" "}
            <a href="mailto:soporte@logify.cl" className="font-medium text-[#4B98CF] hover:underline">
              Contacta a soporte
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
