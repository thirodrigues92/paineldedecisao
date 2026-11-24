import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signInPublicPanel } from "@/lib/public-panel-session";

export const Route = createFileRoute("/public-login")({
  head: () => ({
    meta: [
      { title: "Acesso ao painel público — Painel de Decisão" },
      { name: "description", content: "Entre com e-mail e senha para acessar os indicadores e a DRE da clínica." },
      { property: "og:title", content: "Acesso ao painel público — Painel de Decisão" },
      { property: "og:description", content: "Acesso autenticado ao painel de indicadores da clínica." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicLoginPage,
});

function PublicLoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrorMessage("");
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await signInPublicPanel(supabase.auth, localStorage, email, password);
      setPassword("");
      toast.success("Acesso autorizado");
      await navigate({ to: "/public-dashboard", replace: true });
    } catch {
      setErrorMessage("Não foi possível entrar. Confira o e-mail, a senha e a confirmação da conta.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl">Acesso Visão Executiva</h1>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Insira as credenciais para visualização pública.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="username" required disabled={loading} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" autoComplete="current-password" required disabled={loading} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
