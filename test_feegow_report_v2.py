import requests
import os
import json

token = os.environ.get("FEEGOW_API_TOKEN")
url = "https://api.feegow.com/v1/api/reports/generate"
headers = {
    "x-access-token": token,
    "Content-Type": "application/json"
}

# Test with report ID 51 and more filters
payloads = [
    {
        "report": 51,
        "DATA_INICIO": "17/08/2026",
        "DATA_FIM": "17/08/2026",
        "UNIDADE_ID": 0
    },
    {
        "report": "production",
        "DATA_INICIO": "17/08/2026",
        "DATA_FIM": "17/08/2026",
        "UNIDADE_ID": 0
    },
    {
        "report": 51,
        "DATA_INICIO": "01/01/2026",
        "DATA_FIM": "19/08/2026",
        "UNIDADE_ID": 0
    }
]

for payload in payloads:
    print(f"Testing payload: {json.dumps(payload)}")
    r = requests.post(url, headers=headers, json=payload)
    print(f"Status: {r.status_code}")
    print(f"Response (first 500 chars): {r.text[:500]}")
    print("-" * 20)

