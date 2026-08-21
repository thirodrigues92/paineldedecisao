import { config } from "dotenv";
config();
const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN;
async function test() {
  const res = await fetch("https://api.feegow.com/v1/api/reports/generate", {
    method: "POST",
    headers: { "x-access-token": FEEGOW_TOKEN!, "Content-Type": "application/json" },
    body: JSON.stringify({
      report: "duration-of-service",
      DATA_INICIO: "19/08/2026",
      DATA_FIM: "19/08/2026",
      UNIDADE_IDS: [0]
    })
  });
  const data = await res.json();
  console.log("Total Atendimentos:", data.data?.length);
}
test();
