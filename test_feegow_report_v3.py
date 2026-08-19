import requests
import os
import json

token = os.environ.get("FEEGOW_API_TOKEN")
url = "https://api.feegow.com/v1/api/reports/generate"
headers = {
    "x-access-token": token,
    "Content-Type": "application/json"
}

# Try a 10-day range including Aug 17
payload = {
    "report": 51,
    "DATA_INICIO": "10/08/2026",
    "DATA_FIM": "19/08/2026"
}

print(f"Testing payload: {json.dumps(payload)}")
r = requests.post(url, headers=headers, json=payload)
print(f"Status: {r.status_code}")
res_json = r.json()
if isinstance(res_json, dict) and "data" in res_json:
    data = res_json["data"]
else:
    data = res_json

print(f"Type of data: {type(data)}")
if isinstance(data, list):
    print(f"Length: {len(data)}")
    if len(data) > 0:
        print("Sample item:")
        print(json.dumps(data[0], indent=2))
else:
    print(f"Full response: {json.dumps(res_json, indent=2)}")

