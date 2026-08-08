import type { KeyboardEvent } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Da soporte de teclado (Enter/Espacio) a elementos no interactivos nativos
// (ej. un <div> usado como fila clickeable) que ya tienen role="button" y
// tabIndex={0} — sin esto son inalcanzables para navegacion por teclado.
export function onActivateKey(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };
}

// Igual que onActivateKey pero para overlays/backdrops que cierran al hacer
// click afuera — Escape es la tecla esperada ahi, no Enter/Espacio.
export function onEscapeKey(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      action();
    }
  };
}

export function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Fecha invalida";
  }

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatCurrency(value: number, currency = "CLP") {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("es-CL", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}
