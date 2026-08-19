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
    {"report": "production", "data_inicio": "17/08/2026", "data_fim": "17/08/2026"},
    {"report": "production", "start_date": "17/08/2026", "end_date": "17/08/2026"},
    {"report": "production", "inicio": "17/08/2026", "fim": "17/08/2026"},
    {"report": 51, "DATA_INICIO": "17/08/2026", "DATA_FIM": "17/08/2026"},
]

for payload in variations:
    print(f"Testing payload: {json.dumps(payload)}")
    r = requests.post(url, headers=headers, json=payload)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text}")
    print("-" * 20)

