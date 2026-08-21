import { config } from "dotenv";
config();
const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN;
async function test() {
  const res = await fetch("https://api.feegow.com/v1/api/reports/list", {
    method: "GET",
    headers: { "x-access-token": FEEGOW_TOKEN! }
  });
  const data = await res.json();
  console.log("Reports list:", JSON.stringify(data, null, 2));
}
test();
