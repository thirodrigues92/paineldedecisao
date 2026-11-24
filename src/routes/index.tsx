import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Painel de Decisão — Acesso" },
    { name: "description", content: "Acesso ao painel de gestão e decisão da clínica." },
    { property: "og:title", content: "Painel de Decisão — Acesso" },
    { property: "og:description", content: "Acesso aos indicadores e análises da clínica." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: async () => {
    // Redireciona tudo para o Dashboard (que agora é a visão única)
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" as any });
    
    // Fallback para login se não houver sessão ativa
    throw redirect({ to: "/auth" as any });
  },
  component: () => null,
});