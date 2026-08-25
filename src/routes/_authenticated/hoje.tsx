import { createFileRoute } from "@tanstack/react-router";
import { HojePanel } from "@/components/HojePanel";

export const Route = createFileRoute("/_authenticated/hoje")({
  head: () => ({
    meta: [
      { title: "Hoje — Painel Clínico" },
      { name: "description", content: "Acompanhamento exclusivo dos agendamentos e atendimentos de hoje." },
      { property: "og:title", content: "Hoje — Painel Clínico" },
      { property: "og:description", content: "Acompanhamento exclusivo dos agendamentos e atendimentos de hoje." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HojePage,
});

function HojePage() {
  return <HojePanel />;
}
