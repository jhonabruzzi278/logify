import { ArrowLeft, MapPinOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDocumentMeta } from "@/hooks/use-document-meta";

export function NotFoundPage() {
  const navigate = useNavigate();
  useDocumentMeta({ title: "Página no encontrada" });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <PageHeader
          eyebrow="Error 404"
          title="Esta página no existe"
          description="El enlace que seguiste es incorrecto o el recurso fue movido."
        />

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="rounded-2xl bg-muted p-2">
                <MapPinOff className="h-5 w-5" />
              </div>
              <p className="text-sm">Verifica la dirección o vuelve al panel principal.</p>
            </div>

            <Button variant="outline" onClick={() => navigate("/dashboard", { replace: true })}>
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
