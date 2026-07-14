import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { MapPinned } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({ meta: [{ title: "Mapa de Pacientes" }] }),
  component: () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mapa de Pacientes</h1>
        <p className="text-sm text-muted-foreground">Distribuição geográfica dos pacientes.</p>
      </div>
      <Card>
        <CardContent className="p-10 grid place-items-center text-center gap-3">
          <MapPinned className="h-10 w-10 text-primary" />
          <div className="text-lg font-medium">Em construção — Fase 2</div>
          <p className="text-sm text-muted-foreground max-w-md">
            A estrutura de geocodificação por CEP já está preparada. O mapa de calor será
            construído nesta segunda fase do projeto.
          </p>
        </CardContent>
      </Card>
    </div>
  ),
});
