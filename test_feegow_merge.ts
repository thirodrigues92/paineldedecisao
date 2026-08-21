import { config } from "dotenv";
config();
const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN;
async function test() {
  const get = async (l: string) => {
    const res = await fetch("https://api.feegow.com/v1/api/reports/generate", {
      method: "POST",
      headers: { "x-access-token": FEEGOW_TOKEN!, "Content-Type": "application/json" },
      body: JSON.stringify({
        report: "production",
        DATA_INICIO: "19/08/2026",
        DATA_FIM: "19/08/2026",
        UNIDADE_IDS: [0],
        TIPO_DATA_PRODUCAO: ["EXECUCAO"],
        EXECUCAO_ITEM: [l]
      })
    });
    return (await res.json()).data || [];
  };
  const s = await get("S");
  const n = await get("N");
  const all = [...s, ...n];
  const keys = new Set();
  all.forEach((r: any) => {
    const key = `${r.IDTransacao}|${r.NGuiaPrestador}|${r.ProcedimentoID}|${r.AgendamentoID}`;
    keys.add(key);
  });
  console.log("Unique keys in S+N:", keys.size);
  
  // Summing values of unique keys
  const uniqueItems = new Map();
  all.forEach((r: any) => {
    const key = `${r.IDTransacao}|${r.NGuiaPrestador}|${r.ProcedimentoID}|${r.AgendamentoID}`;
    if (!uniqueItems.has(key) || r.Situacao === "Faturado") {
      uniqueItems.set(key, r);
    }
  });
  
  const val = Array.from(uniqueItems.values()).reduce((acc: number, r: any) => acc + (Number(String(r.Valor).replace(",", ".")) || 0), 0);
  console.log("Total unique value:", val);
}
test();
