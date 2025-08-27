import os
import sys
import json
import time
from typing import List, Dict, Any

import requests

API_BASE_URL = os.environ.get("API_BASE_URL", "https://studentportal.egypt-tech.com/api")
ADMIN_PHONE = 'admin'
ADMIN_PASSWORD = 'admin123'

LOGIN_ENDPOINT = f"{API_BASE_URL}/admin/login"
CREATE_STUDENT_ENDPOINT = f"{API_BASE_URL}/admin/students"


def load_students(json_path: str) -> List[Dict[str, Any]]:
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def admin_login() -> str:
    if not ADMIN_PHONE or not ADMIN_PASSWORD:
        print("ERROR: Please set ADMIN_PHONE and ADMIN_PASSWORD environment variables.")
        sys.exit(1)

    resp = requests.post(
        LOGIN_ENDPOINT,
        json={"phone_number": ADMIN_PHONE, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"ERROR: Admin login failed ({resp.status_code}): {resp.text}")
        sys.exit(1)

    data = resp.json()
    token = data.get("token")
    if not token:
        print("ERROR: No token returned from login response.")
        sys.exit(1)
    return token


def create_student(headers: Dict[str, str], payload: Dict[str, Any]) -> bool:
    resp = requests.post(CREATE_STUDENT_ENDPOINT, json=payload, headers=headers, timeout=30)
    if resp.status_code in (200, 201):
        return True
    else:
        # Log and continue on errors (e.g., duplicate phone number)
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        print(f"WARN: Failed to create student {payload.get('name')} ({resp.status_code}): {body}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/import_students.py <path_to_json>")
        sys.exit(1)

    json_path = sys.argv[1]
    if not os.path.exists(json_path):
        print(f"ERROR: File not found: {json_path}")
        sys.exit(1)

    students = load_students(json_path)
    print(f"Loaded {len(students)} students from {json_path}")

    token = admin_login()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    success_count = 0
    created_records: List[Dict[str, Any]] = []
    for i, s in enumerate(students, start=1):
        payload = {
            "name": s["name"],
            "phone_number": s["phone_number"],
            "parent_phone": s.get("parent_phone"),
            "grade": s["grade"],
            "student_group": s.get("student_group"),
            "password": s["password"],
        }
        if create_student(headers, payload):
            success_count += 1
            created_records.append({
                "name": s["name"],
                "phone_number": s["phone_number"],
                "parent_phone": s.get("parent_phone"),
                "password": s["password"],
            })
        # Be gentle with the API
        time.sleep(0.1)

    print(f"Done. Created {success_count}/{len(students)} students.")

    # Write a JSON file with the successfully created students
    base_dir = os.path.dirname(json_path)
    base_name = os.path.splitext(os.path.basename(json_path))[0]
    out_path = os.path.join(base_dir, f"{base_name}_created.json")
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(created_records, f, ensure_ascii=False, indent=2)
        print(f"Saved created students list to: {out_path}")
    except Exception as e:
        print(f"ERROR: Failed to write output file {out_path}: {e}")


if __name__ == "__main__":
    main()
