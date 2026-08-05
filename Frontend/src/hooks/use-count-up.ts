import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

/**
 * Interpola numericamente hacia `value` con GSAP para dar sensacion de "vivo"
 * a las metricas del dashboard, sin cambiar el formato final mostrado.
 */
export function useCountUp(value: number, duration = 0.6): number {
  const [display, setDisplay] = useState(value);
  const proxyRef = useRef({ val: value });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    const proxy = proxyRef.current;
    const tween = gsap.to(proxy, {
      val: value,
      duration,
      ease: "power2.out",
      onUpdate: () => setDisplay(proxy.val),
    });

    return () => {
      tween.kill();
    };
  }, [value, duration]);

  return display;
}
