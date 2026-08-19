import requests
import os
import json
from datetime import datetime, timedelta

token = os.environ.get("FEEGOW_API_TOKEN")
url = "https://api.feegow.com/v1/api/reports/generate"
headers = {
    "x-access-token": token,
    "Content-Type": "application/json"
}

# Try a 60-day range up to today
end_date = datetime.now()
start_date = end_date - timedelta(days=59)

payload = {
    "report": 51,
    "DATA_INICIO": start_date.strftime("%d/%m/%Y"),
    "DATA_FIM": end_date.strftime("%d/%m/%Y")
}

print(f"Testing payload: {json.dumps(payload)}")
r = requests.post(url, headers=headers, json=payload)
print(f"Status: {r.status_code}")
res_json = r.json()
print(f"Response: {json.dumps(res_json)[:1000]}")

