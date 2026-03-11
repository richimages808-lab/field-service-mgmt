import requests
import sys

try:
    response = requests.post('http://127.0.0.1:8000/api/login/', json={
        'username': 'admin2',
        'password': 'password123'
    })
    
    if response.status_code == 200:
        data = response.json()
        print("Login Successful!")
        print(f"Token: {data.get('token')}")
        print(f"Firebase Token: {data.get('firebase_token')}")
        print(f"Role: {data.get('role')}")
    else:
        print(f"Login Failed: {response.status_code}")
        print(response.text)
        sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
