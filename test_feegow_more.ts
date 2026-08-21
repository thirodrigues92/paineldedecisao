import { config } from "dotenv";
config();
const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN;
async function test() {
  const configs = [
    { report: "production", DATA_INICIO: "19/08/2026", DATA_FIM: "19/08/2026", UNIDADE_IDS: [0], TIPO_DATA_PRODUCAO: ["EXECUCAO"] },
    { report: "production", DATA_INICIO: "19/08/2026", DATA_FIM: "19/08/2026", UNIDADE_IDS: [0], TIPO_DATA_PRODUCAO: ["EXECUCAO"], EXECUCAO_ITEM: ["S", "N"] },
    { report: "production", DATA_INICIO: "19/08/2026", DATA_FIM: "19/08/2026", UNIDADE_IDS: [0], TIPO_DATA_PRODUCAO: ["EXECUCAO"], EXIBIR_ITENS_SEM_CONTA: "S" },
    { report: "production", DATA_INICIO: "19/08/2026", DATA_FIM: "19/08/2026", UNIDADE_IDS: [0], TIPO_DATA_PRODUCAO: ["EXECUCAO"], EXECUCAO_ITEM: ["S"], MOSTRAR_TODOS: "S" }
  ];

  for (const c of configs) {
    const res = await fetch("https://api.feegow.com/v1/api/reports/generate", {
      method: "POST",
      headers: { "x-access-token": FEEGOW_TOKEN!, "Content-Type": "application/json" },
      body: JSON.stringify(c)
    });
    const data = await res.json();
    console.log(`Config ${configs.indexOf(c)}: Total records = ${data.data?.length}`);
  }
}
test();
