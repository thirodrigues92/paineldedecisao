import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    // Redireciona tudo para o Dashboard (que agora é a visão única)
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" as any });
    
    // Fallback para login se não houver sessão ativa
    throw redirect({ to: "/auth" as any });
  },
  component: () => null,
});