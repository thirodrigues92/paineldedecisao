import requests
import os
import json

token = os.environ.get("FEEGOW_API_TOKEN")
url = "https://api.feegow.com/v1/api/reports/generate"
headers = {
    "x-access-token": token,
    "Content-Type": "application/json"
}

variations = [
    {"report": "production", "DATA_INICIO": "17/08/2026", "DATA_FIM": "17/08/2026"},
    {"report": "production", "DATA_INICIAL": "17/08/2026", "DATA_FINAL": "17/08/2026"},
    {"report": "production", "INICIO": "17/08/2026", "FIM": "17/08/2026"},
    {"report": "production", "data_inicio": "17/08/2026", "data_fim": "17/08/2026"},
    {"report": "production", "report_id": 51, "DATA_INICIO": "17/08/2026", "DATA_FIM": "17/08/2026"},
    {"report": "production", "UNIDADE_ID": 0, "DATA_INICIO": "17/08/2026", "DATA_FIM": "17/08/2026"},
    {"report": "production", "FILTRO_DATA": "execucao", "DATA_INICIO": "17/08/2026", "DATA_FIM": "17/08/2026"},
    {"report": "production", "tipo_data": "execucao", "DATA_INICIO": "17/08/2026", "DATA_FIM": "17/08/2026"},
]

for payload in variations:
    print(f"Testing payload: {json.dumps(payload)}")
    r = requests.post(url, headers=headers, json=payload)
    res = r.json()
    print(f"Status: {r.status_code}")
    # Check if data is a list or just boolean
    data = res.get("data")
    if isinstance(data, list):
        print(f"Result: SUCCESS (List with {len(data)} items)")
        if len(data) > 0:
            print(json.dumps(data[0], indent=2))
            break
    else:
        print(f"Result: data is {data}")
    print("-" * 20)

