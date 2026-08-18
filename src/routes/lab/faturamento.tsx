import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { labDebugFeegow } from "@/lib/lab-faturamento.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/lab/faturamento")({
  component: LabFaturamento,
});

function LabFaturamento() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testEndpoint = async (endpoint: string) => {
    setLoading(true);
    try {
      const res = await labDebugFeegow({ data: { endpoint, params: {} } });
      setResult({ endpoint, ...res });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">🧪 Lab — Faturamento</h1>
      <Tabs defaultValue="diagnostico">
        <TabsList>
          <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
          <TabsTrigger value="sincronizacao">Sincronização</TabsTrigger>
          <TabsTrigger value="faturamento">Faturado x Recebido</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="diagnostico" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {["financial/list-accounts", "billing/insurances-billing", "insurance/list"].map(ep => (
              <Button key={ep} onClick={() => testEndpoint(ep)} disabled={loading}>
                Testar {ep}
              </Button>
            ))}
          </div>
          {result && (
            <Card>
              <CardHeader>
                <CardTitle>{result.endpoint}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Status: {result.http_status} | Success: {result.api_success ? "Sim" : "Não"}</p>
                <p>Total: {result.total_registros}</p>
                <pre className="bg-muted p-4 mt-2 overflow-auto text-xs">{JSON.stringify(result.raw, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="sincronizacao">Em breve...</TabsContent>
        <TabsContent value="faturamento">Em breve...</TabsContent>
        <TabsContent value="auditoria">Em breve...</TabsContent>
      </Tabs>
    </div>
  );
}
