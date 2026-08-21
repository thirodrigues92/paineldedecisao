import { config } from "dotenv";
config();
const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN;
async function test() {
  const c = {
    report: "production",
    DATA_INICIO: "19/08/2026",
    DATA_FIM: "19/08/2026",
    UNIDADE_IDS: [0],
    TIPO_DATA_PRODUCAO: ["EXECUCAO"],
    EXECUCAO_ITEM: ["S", "N", "A"],
    MOSTRAR_TODOS: "S"
  };
  const res = await fetch("https://api.feegow.com/v1/api/reports/generate", {
    method: "POST",
    headers: { "x-access-token": FEEGOW_TOKEN!, "Content-Type": "application/json" },
    body: JSON.stringify(c)
  });
  const data = await res.json();
  console.log("Total records (S, N, A):", data.data?.length);
}
test();
