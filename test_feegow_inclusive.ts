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
    EXECUCAO_ITEM: ["S", "N"],
    MOSTRAR_TODOS: "S",
    EXIBIR_CANCELADOS: "S",
    EXIBIR_ITENS_SEM_CONTA: "S"
  };
  const res = await fetch("https://api.feegow.com/v1/api/reports/generate", {
    method: "POST",
    headers: { "x-access-token": FEEGOW_TOKEN!, "Content-Type": "application/json" },
    body: JSON.stringify(c)
  });
  const data = await res.json();
  console.log("Total records (inclusive):", data.data?.length);
  if (data.data) {
    const sit = new Set(data.data.map((r: any) => r.Situacao));
    console.log("Situations:", Array.from(sit));
    const val = data.data.reduce((acc: number, r: any) => acc + (Number(String(r.Valor).replace(",", ".")) || 0), 0);
    console.log("Total Value:", val);
  }
}
test();
