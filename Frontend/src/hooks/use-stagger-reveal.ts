import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * Anima con fade+slide-up en cascada a los hijos directos del contenedor
 * la primera vez que `ready` pasa a true (p.ej. cuando termina de cargar data).
 */
export function useStaggerReveal<T extends HTMLElement>(ready: boolean) {
  const containerRef = useRef<T>(null);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    if (!ready || hasPlayedRef.current || !containerRef.current) return;
    hasPlayedRef.current = true;

    const children = Array.from(containerRef.current.children);
    if (children.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.fromTo(
      children,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power2.out" }
    );
  }, [ready]);

  return containerRef;
}
