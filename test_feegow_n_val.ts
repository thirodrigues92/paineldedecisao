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
      EXECUCAO_ITEM: ["N"]
    })
  });
  const data = await res.json();
  const val = data.data.reduce((acc: number, r: any) => acc + (Number(String(r.Valor).replace(",", ".")) || 0), 0);
  console.log("Total Value for N:", val);
  const filtered = data.data.filter((r: any) => (Number(String(r.Valor).replace(",", ".")) || 0) > 0);
  console.log("Items with value > 0:", filtered.length);
  const valFiltered = filtered.reduce((acc: number, r: any) => acc + (Number(String(r.Valor).replace(",", ".")) || 0), 0);
  console.log("Sum of items with value > 0:", valFiltered);
}
test();
