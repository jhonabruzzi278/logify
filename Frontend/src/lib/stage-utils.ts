import type { OrderStage, ShipmentStage } from "@/types/domain";

export function badgeColor(stage: string): string {
  if (stage === "created") return "bg-[#2563EB]/10 text-[#2563EB]";
  if (stage === "en_preparacion") return "bg-[#D97706]/10 text-[#D97706]";
  if (stage === "en_reparto") return "bg-purple-50 text-purple-600";
  if (stage === "entregado") return "bg-green-50 text-green-600";
  if (stage === "cancelado") return "bg-red-50 text-red-500";
  return "bg-muted text-muted-foreground";
}

export function stageLabel(stage: string): string {
  if (stage === "created") return "Pendiente";
  if (stage === "en_preparacion") return "Preparacion";
  if (stage === "en_reparto") return "En reparto";
  if (stage === "entregado") return "Entregado";
  if (stage === "cancelado") return "Cancelado";
  return stage;
}

export function shipmentStepIndex(stage: string): number {
  const s = stage.toLowerCase();
  if (s === "entregado") return 2;
  if (s === "en_reparto") return 1;
  if (s === "cancelado") return -1;
  return 0;
}

export const STEP_LABELS = ["Preparacion", "En reparto", "Entregado"] as const;

export const ORDER_STAGES = ["created", "en_preparacion", "en_reparto", "entregado"] as const;
export const ORDER_STAGE_LABELS = ["Recibido", "Preparacion", "En reparto", "Entregado"] as const;

export function orderStageIndex(stage: OrderStage): number {
  return ORDER_STAGES.indexOf(stage);
}

export function stageColorDot(index: number, currentIndex: number): string {
  if (index < currentIndex) return "bg-[#0D9488]";
  if (index === currentIndex) return "bg-[#2563EB]";
  return "bg-[#E2E8F0]";
}

export function stageConnectorColor(index: number, currentIndex: number): string {
  return index < currentIndex ? "bg-[#0D9488]" : "bg-[#E2E8F0]";
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins} min`;
  if (hrs < 24) return `Hace ${hrs}h`;
  if (days === 1) return "Ayer";
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}
