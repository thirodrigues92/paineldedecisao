import { createFileRoute } from "@tanstack/react-router";
import { MapaPacientes } from "@/components/MapaPacientes";

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa de Pacientes — Painel de Decisão Clínica" },
      { name: "description", content: "Mapa de calor geográfico da demanda de pacientes por bairro, especialidade e perfil." },
    ],
  }),
  component: MapaPage,
});

function MapaPage() {
  return <MapaPacientes />;
}
