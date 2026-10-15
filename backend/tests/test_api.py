from fastapi.testclient import TestClient


def test_login_and_identity(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "test-password-2026"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "Admin"
    assert "password_hash" not in response.json()["user"]

    token = response.json()["access_token"]
    identity = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert identity.status_code == 200
    assert identity.json()["username"] == "admin"


def test_invalid_login_and_unauthorized_access(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "incorrect-password"},
    )

    assert response.status_code == 401
    assert client.get("/api/patients").status_code == 401


def test_admin_can_register_patient_and_create_invoice(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    patient_response = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "full_name": "Morgan Lee",
            "age": 36,
            "gender": "Female",
            "contact": "+1 555 012 0099",
            "address": "100 Main Street",
        },
    )

    assert patient_response.status_code == 201
    patient = patient_response.json()
    assert patient["unique_patient_id"].startswith("RH-")

    invoice_response = client.post(
        "/api/billing",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "total_amount": "125.00",
            "discount": "25.00",
        },
    )

    assert invoice_response.status_code == 201
    assert invoice_response.json()["final_amount"] == "100.00"
    assert invoice_response.json()["payment_status"] == "Unpaid"


def test_doctor_cannot_register_patients(client: TestClient) -> None:
    login = client.post(
        "/api/auth/login",
        json={"username": "doctor", "password": "test-password-2026"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = client.post(
        "/api/patients",
        headers=headers,
        json={
            "full_name": "Morgan Lee",
            "age": 36,
            "gender": "Female",
            "contact": "+1 555 012 0099",
            "address": "100 Main Street",
        },
    )

    assert response.status_code == 403


def test_admin_can_create_deactivate_and_reactivate_doctor(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    created = client.post(
        "/api/doctors",
        headers=admin_headers,
        json={
            "username": "dr.morgan",
            "password": "doctor-password-2026",
            "full_name": "Morgan Lee",
            "department": "Cardiology",
            "specialization": "Cardiology",
            "consultation_fee": "500.00",
            "availability_schedule": "Weekdays",
        },
    )
    assert created.status_code == 201
    doctor = created.json()
    assert doctor["is_active"] is True
    assert doctor["username"] == "dr.morgan"
    assert "password" not in doctor

    doctor_login = client.post(
        "/api/auth/login",
        json={"username": "dr.morgan", "password": "doctor-password-2026"},
    )
    assert doctor_login.status_code == 200
    doctor_headers = {"Authorization": f"Bearer {doctor_login.json()['access_token']}"}

    patient_response = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "full_name": "Taylor Reed",
            "age": 42,
            "gender": "Other",
            "contact": "5550101000",
            "address": "100 Main Street",
        },
    )
    appointment_payload = {
        "patient_id": patient_response.json()["id"],
        "doctor_id": doctor["id"],
        "type": "OPD",
        "appointment_datetime": "2030-01-01T10:00:00Z",
    }
    appointment = client.post("/api/appointments", headers=admin_headers, json=appointment_payload)
    assert appointment.status_code == 201

    deactivated = client.delete(f"/api/doctors/{doctor['id']}", headers=admin_headers)
    assert deactivated.status_code == 204
    assert client.get("/api/auth/me", headers=doctor_headers).status_code == 401
    assert client.post(
        "/api/auth/login",
        json={"username": "dr.morgan", "password": "doctor-password-2026"},
    ).status_code == 401
    assert any(
        item["id"] == appointment.json()["id"]
        for item in client.get("/api/appointments", headers=admin_headers).json()
    )
    assert client.post(
        "/api/appointments",
        headers=admin_headers,
        json=appointment_payload,
    ).status_code == 404

    doctor_list = client.get("/api/doctors", headers=admin_headers)
    assert doctor_list.status_code == 200
    assert next(item for item in doctor_list.json() if item["id"] == doctor["id"])["is_active"] is False

    reactivated = client.post(f"/api/doctors/{doctor['id']}/reactivate", headers=admin_headers)
    assert reactivated.status_code == 200
    assert reactivated.json()["is_active"] is True
    assert client.post(
        "/api/auth/login",
        json={"username": "dr.morgan", "password": "doctor-password-2026"},
    ).status_code == 200


def test_discount_cannot_exceed_invoice_total(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/billing",
        headers=admin_headers,
        json={"patient_id": 1, "total_amount": "20.00", "discount": "25.00"},
    )

    assert response.status_code == 422