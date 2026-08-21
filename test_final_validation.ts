import { config } from "dotenv";
config();
const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN;
async function test() {
  const res = await fetch("https://api.feegow.com/v1/api/reports/generate", {
    method: "POST",
    headers: { "x-access-token": FEEGOW_TOKEN!, "Content-Type": "application/json" },
    body: JSON.stringify({
      report: "production",
      DATA_INICIO: "19/08/2026",
      DATA_FIM: "19/08/2026",
      UNIDADE_IDS: [0],
      TIPO_DATA_PRODUCAO: ["EXECUCAO"],
      EXECUCAO_ITEM: ["S", "N"]
    })
  });
  const data = await res.json();
  const rows = data.data || [];
  console.log("--- VALIDAÇÃO FINAL (API) ---");
  console.log("Total de linhas:", rows.length);
  const faturados = rows.filter((r: any) => r.Situacao === "Faturado");
  const naoFaturados = rows.filter((r: any) => r.Situacao === "Não Faturado");
  console.log("Situacao = 'Faturado':", faturados.length);
  console.log("Situacao = 'Não Faturado':", naoFaturados.length);
  
  const valF = faturados.reduce((acc: number, r: any) => acc + (Number(String(r.Valor).replace(",", ".")) || 0), 0);
  const valNF = naoFaturados.reduce((acc: number, r: any) => acc + (Number(String(r.Valor).replace(",", ".")) || 0), 0);
  const valTotal = rows.reduce((acc: number, r: any) => acc + (Number(String(r.Valor).replace(",", ".")) || 0), 0);
  
  console.log("Soma Faturados: R$", valF.toFixed(2));
  console.log("Soma Não Faturados: R$", valNF.toFixed(2));
  console.log("Soma Total: R$", valTotal.toFixed(2));
}
test();
