import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InstallAppButtonProps {
  canInstall: boolean;
  onInstall?: () => void;
  compact?: boolean;
  className?: string;
}

export function InstallAppButton({ canInstall, onInstall, compact = false, className }: InstallAppButtonProps) {
  return (
    <Button
      type="button"
      variant={canInstall ? "secondary" : "outline"}
      size={compact ? "sm" : "default"}
      className={cn("whitespace-nowrap", compact ? "gap-1.5 px-3" : "gap-2", className)}
      onClick={onInstall}
      disabled={!canInstall}
      title={canInstall ? "Instalar Logify como app" : "La instalacion no esta disponible en este momento"}
    >
      <Download className="h-4 w-4" />
      <span>{compact ? "Instalar" : "Instalar app"}</span>
    </Button>
  );
}
