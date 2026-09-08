import { createFileRoute } from "@tanstack/react-router";
import { FaturamentoDinamicoPage } from "@/components/FaturamentoDinamico";

export const Route = createFileRoute("/_authenticated/faturamento-dinamico")({
  component: FaturamentoDinamicoPage,
});
