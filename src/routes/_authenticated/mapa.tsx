import { createFileRoute } from "@tanstack/react-router";
import { MapaPacientes } from "@/components/MapaPacientes";

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa de Pacientes — Painel de Decisão Clínica" },
      { name: "description", content: "Mapa de calor geográfico da demanda de pacientes por bairro, especialidade e perfil." },
      { property: "og:title", content: "Mapa de Pacientes — Painel de Decisão Clínica" },
      { property: "og:description", content: "Cobertura dos atendimentos reais por paciente, cidade e bairro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MapaPage,
});

function MapaPage() {
  return <MapaPacientes />;
}
