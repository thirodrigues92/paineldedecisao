import { config } from "dotenv";
config();

const FEEGOW_BASE = "https://api.feegow.com/v1/api";
const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN;

async function test() {
  const res = await fetch(`${FEEGOW_BASE}/reports/generate`, {
    method: "POST",
    headers: {
      "x-access-token": FEEGOW_TOKEN!,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      report: "production",
      DATA_INICIO: "19/08/2026",
      DATA_FIM: "19/08/2026",
      UNIDADE_IDS: [0],
      TIPO_DATA_PRODUCAO: ["EXECUCAO"],
      EXECUCAO_ITEM: ["S"]
    })
  });
  const data = await res.json();
  console.log("Total records:", data.data?.length);
  const situations = new Set(data.data?.map((r: any) => r.Situacao));
  console.log("Situations found:", Array.from(situations));
  
  // Test with SITUACAO filter
  const res2 = await fetch(`${FEEGOW_BASE}/reports/generate`, {
    method: "POST",
    headers: {
      "x-access-token": FEEGOW_TOKEN!,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      report: "production",
      DATA_INICIO: "19/08/2026",
      DATA_FIM: "19/08/2026",
      UNIDADE_IDS: [0],
      TIPO_DATA_PRODUCAO: ["EXECUCAO"],
      EXECUCAO_ITEM: ["S"],
      SITUACAO: ["Faturado", "Não Faturado"]
    })
  });
  const data2 = await res2.json();
  console.log("Total records (with SITUACAO filter):", data2.data?.length);
}

test();
