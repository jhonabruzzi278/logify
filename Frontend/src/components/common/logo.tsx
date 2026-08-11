import { cn } from "@/lib/utils";

type Props = {
  /** "brand" = marca azul, para fondos claros. "light" = marca blanca, para paneles oscuros (sidebar, panel de login). */
  variant?: "brand" | "light";
  size?: "sm" | "md" | "lg";
  className?: string;
};

const MARK_SRC: Record<NonNullable<Props["variant"]>, string> = {
  brand: "/logo/logify-mark.png",
  light: "/logo/logify-mark-white.png"
};

const TEXT_COLOR: Record<NonNullable<Props["variant"]>, string> = {
  brand: "text-foreground",
  light: "text-white"
};

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, { mark: string; text: string }> = {
  sm: { mark: "h-6 w-6", text: "text-lg" },
  md: { mark: "h-7 w-7", text: "text-xl" },
  lg: { mark: "h-9 w-9", text: "text-2xl" }
};

export function Logo({ variant = "brand", size = "md", className }: Props) {
  const { mark, text } = SIZE_CLASSES[size];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img src={MARK_SRC[variant]} alt="" width={36} height={36} className={cn("shrink-0", mark)} />
      <span className={cn("font-logo", text, TEXT_COLOR[variant])}>Logify</span>
    </span>
  );
}
