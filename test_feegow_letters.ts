import { config } from "dotenv";
config();
const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN;
async function test() {
  const letters = ["S", "N", "A", "I", "V", "C"];
  for (const l of letters) {
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
    const data = await res.json();
    console.log(`Letter ${l}: Total = ${data.data?.length}`);
  }
}
test();
