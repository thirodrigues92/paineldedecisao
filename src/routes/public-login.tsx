import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/public-login")({
  head: () => ({
    meta: [
      { title: "Acesso — Visão Executiva" },
    ],
  }),
  component: PublicLoginPage,
});

function PublicLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Credenciais simplificadas solicitadas
    if (username === "admin" && password === "admin") {
      localStorage.setItem("public_admin_session", "true");
      toast.success("Acesso autorizado");
      navigate({ to: "/public-dashboard" });
    } else {
      toast.error("Usuário ou senha inválidos");
    }
    setLoading(false);
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
              <Label htmlFor="username">Usuário</Label>
              <Input id="username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
