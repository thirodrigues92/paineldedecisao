import { createFileRoute } from "@tanstack/react-router";
import { DreAnual } from "@/components/DreAnual";

export const Route = createFileRoute("/_authenticated/financeiro_/dre")({
  head: () => ({ meta: [
    { title: "DRE anual Feegow — Painel de Decisão" },
    { name: "description", content: "DRE anual por pagamento ou competência, com categorias, unidades, repasses e itens detalhados." },
    { property: "og:title", content: "DRE anual Feegow — Painel de Decisão" },
    { property: "og:description", content: "Resultados mensais, árvore do Plano de Contas e detalhamento dos itens financeiros." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: DreAnual,
});

