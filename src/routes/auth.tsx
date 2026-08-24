import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Painel de Decisão Clínica" },
      { name: "description", content: "Acesso restrito aos gestores da clínica." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" as any });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" as any });
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Conta criada. Se a confirmação por e-mail estiver ativa, verifique sua caixa.");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao autenticar");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl">Painel de Decisão Clínica</h1>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {mode === "signin" ? "Entre com seu e-mail e senha." : "Crie sua conta de gestor."}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Não tem conta? Criar" : "Já tenho conta"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
