"""
Comprehensive API integration tests for KSOR backend.

Usage:
    pip install httpx pytest pytest-asyncio
    pytest tests/test_api.py -v

Requires:
    - Server running at http://localhost:8000
    - Database with test users (admin@ksor.kr / Admin1234!, doctor@ksor.kr / Admin1234!)
    - Reference data loaded (diagnosis codes, procedure codes, instruments, timepoints)
"""
from __future__ import annotations

import httpx
import pytest

BASE_URL = "http://localhost:8000/api"
ADMIN_LOGIN = {"login_id": "admin@ksor.kr", "password": "Admin1234!"}
DOCTOR_LOGIN = {"login_id": "doctor@ksor.kr", "password": "Admin1234!"}


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
        yield c


@pytest.fixture(scope="module")
def admin_token(client: httpx.Client) -> str:
    resp = client.post("/auth/login", json=ADMIN_LOGIN)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    return data["data"]["access_token"]


@pytest.fixture(scope="module")
def admin_refresh_token(client: httpx.Client) -> str:
    resp = client.post("/auth/login", json=ADMIN_LOGIN)
    return resp.json()["data"]["refresh_token"]


@pytest.fixture(scope="module")
def admin_user_id(client: httpx.Client, admin_token: str) -> str:
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    return resp.json()["data"]["user_id"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ──────────────────────────────────────────
# Health
# ──────────────────────────────────────────
class TestHealth:
    def test_live(self, client: httpx.Client):
        resp = client.get("/health/live")
        assert resp.status_code == 200

    def test_ready(self, client: httpx.Client):
        resp = client.get("/health/ready")
        assert resp.status_code == 200


# ──────────────────────────────────────────
# Auth
# ──────────────────────────────────────────
class TestAuth:
    def test_login_success(self, client: httpx.Client):
        resp = client.post("/auth/login", json=ADMIN_LOGIN)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user_info"]["role"] == "ADMIN"

    def test_login_wrong_password(self, client: httpx.Client):
        resp = client.post("/auth/login", json={"login_id": "admin@ksor.kr", "password": "wrongpass1"})
        assert resp.status_code in (401, 400)

    def test_login_nonexistent_user(self, client: httpx.Client):
        resp = client.post("/auth/login", json={"login_id": "nobody@ksor.kr", "password": "Admin1234!"})
        assert resp.status_code in (401, 404)

    def test_me(self, client: httpx.Client, admin_token: str):
        resp = client.get("/auth/me", headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["login_id"] == "admin@ksor.kr"
        assert data["role"] == "ADMIN"

    def test_me_no_auth(self, client: httpx.Client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_me_invalid_token(self, client: httpx.Client):
        resp = client.get("/auth/me", headers=auth_headers("invalid_token"))
        assert resp.status_code == 401

    def test_update_profile(self, client: httpx.Client, admin_token: str):
        resp = client.put(
            "/auth/me/info",
            json={"email": "admin@ksor.kr", "phone": "010-1234-5678"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200

    def test_change_password(self, client: httpx.Client, admin_token: str):
        resp = client.put(
            "/auth/password",
            json={
                "current_password": "Admin1234!",
                "new_password": "Admin1234!",
                "new_password_confirm": "Admin1234!",
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200

    def test_refresh_token(self, client: httpx.Client, admin_refresh_token: str):
        resp = client.post("/auth/refresh", json={"refresh_token": admin_refresh_token})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "access_token" in data

    def test_logout(self, client: httpx.Client):
        # Login fresh, then logout
        login_resp = client.post("/auth/login", json=ADMIN_LOGIN)
        token = login_resp.json()["data"]["access_token"]
        resp = client.post("/auth/logout", headers=auth_headers(token))
        assert resp.status_code == 200


# ──────────────────────────────────────────
# Dashboard
# ──────────────────────────────────────────
class TestDashboard:
    def test_summary(self, client: httpx.Client, admin_token: str):
        resp = client.get("/dashboard/summary", headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "total_surgeries" in data
        assert "monthly_surgeries" in data
        assert "prom_pending_cases" in data

    def test_my_surgeries(self, client: httpx.Client, admin_token: str):
        resp = client.get("/dashboard/my-surgeries?page=1&size=10", headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "monthly_trends" in data
        assert "procedure_ratio" in data
        assert "diagnosis_ratio" in data

    def test_outcomes(self, client: httpx.Client, admin_token: str):
        resp = client.get("/dashboard/outcomes", headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "prom_trends" in data
        assert "outcome_summary" in data


# ──────────────────────────────────────────
# Patients CRUD
# ──────────────────────────────────────────
class TestPatients:
    case_id: str = ""
    patient_id: str = ""

    def test_create_patient(self, client: httpx.Client, admin_token: str, admin_user_id: str):
        resp = client.post(
            "/patients",
            json={
                "patient_initial": "TST",
                "sex": "F",
                "birth_year": 1985,
                "birth_date": "1985-03-20",
                "visit_date": "2026-03-30",
                "phone": "010-1111-2222",
                "diagnosis_code": "D001",
                "procedure_code": "P001",
                "surgery_date": "2026-05-01",
                "surgeon_user_id": admin_user_id,
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()["data"]
        assert "patient_id" in data
        assert "case_id" in data
        assert "registration_id" in data
        TestPatients.case_id = data["case_id"]
        TestPatients.patient_id = data["patient_id"]

    def test_list_patients(self, client: httpx.Client, admin_token: str):
        resp = client.get("/patients?page=1&size=10", headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["pagination"]["total_elements"] >= 1
        assert len(data["patients"]) >= 1

    def test_list_patients_with_keyword(self, client: httpx.Client, admin_token: str):
        resp = client.get("/patients?page=1&size=10&keyword=TST", headers=auth_headers(admin_token))
        assert resp.status_code == 200
        patients = resp.json()["data"]["patients"]
        assert any(p["patient_initial"] == "TST" for p in patients)

    def test_update_clinical(self, client: httpx.Client, admin_token: str):
        resp = client.patch(
            f"/patients/{TestPatients.case_id}/clinical",
            json={
                "diagnosis_code": "D001",
                "procedure_code": "P001",
                "surgery_date": "2026-05-01",
                "approach_type": "ANTERIOR",
                "operation_minutes": 90,
                "hospital_stay_days": 3.0,
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "updated_fields" in data

    def test_update_outcomes(self, client: httpx.Client, admin_token: str):
        resp = client.patch(
            f"/patients/{TestPatients.case_id}/outcomes",
            json={
                "complication_yn": False,
                "readmission_30d_yn": False,
                "surgeon_global_outcome": 5,
                "return_to_work_yn": True,
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200

    def test_put_memo(self, client: httpx.Client, admin_token: str):
        resp = client.put(
            f"/patients/{TestPatients.case_id}/memo",
            json={"visibility": "PRIVATE", "memo_text": "Test memo content"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["memo_text"] == "Test memo content"

    def test_get_memo(self, client: httpx.Client, admin_token: str):
        resp = client.get(
            f"/patients/{TestPatients.case_id}/memo",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["memo_text"] == "Test memo content"

    def test_lock_case(self, client: httpx.Client, admin_token: str):
        resp = client.patch(
            f"/patients/{TestPatients.case_id}/lock",
            json={"is_locked": True, "reason": "Review complete"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["is_locked"] is True

    def test_unlock_case(self, client: httpx.Client, admin_token: str):
        resp = client.patch(
            f"/patients/{TestPatients.case_id}/lock",
            json={"is_locked": False},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["is_locked"] is False

    def test_send_prom_alimtalk(self, client: httpx.Client, admin_token: str):
        resp = client.post(
            f"/patients/{TestPatients.case_id}/prom-alimtalk",
            json={"timepoint_code": "PRE_OP", "expires_in_days": 7},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 202
        data = resp.json()["data"]
        assert "request_id" in data
        assert data["tracking_status"] == "SENT_PENDING"

    def test_invalid_diagnosis_code(self, client: httpx.Client, admin_token: str, admin_user_id: str):
        resp = client.post(
            "/patients",
            json={
                "patient_initial": "ERR",
                "sex": "M",
                "visit_date": "2026-03-30",
                "diagnosis_code": "INVALID_CODE",
                "procedure_code": "P001",
                "surgeon_user_id": admin_user_id,
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400
        assert resp.json()["error_code"] == "FOREIGN_KEY_VIOLATION"

    def test_nonexistent_case(self, client: httpx.Client, admin_token: str):
        resp = client.patch(
            "/patients/00000000-0000-0000-0000-000000000000/clinical",
            json={"diagnosis_code": "D001"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


# ──────────────────────────────────────────
# Reports
# ──────────────────────────────────────────
class TestReports:
    def test_get_report_data(self, client: httpx.Client, admin_token: str):
        resp = client.get("/reports", headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "summary" in data
        assert "monthly_trend" in data
        assert "surgery_outcomes" in data

    def test_get_report_data_with_dates(self, client: httpx.Client, admin_token: str):
        resp = client.get(
            "/reports?date_from=2024-01-01&date_to=2027-12-31",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200

    def test_download_csv(self, client: httpx.Client, admin_token: str):
        resp = client.get("/reports/pdf", headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")
        assert len(resp.content) > 0


# ──────────────────────────────────────────
# Export
# ──────────────────────────────────────────
class TestExport:
    def test_export_csv(self, client: httpx.Client, admin_token: str):
        resp = client.get("/export/csv", headers=auth_headers(admin_token))
        assert resp.status_code == 200


# ──────────────────────────────────────────
# Survey (full flow)
# ──────────────────────────────────────────
class TestSurvey:
    token_uuid: str = ""
    survey_token: str = ""

    def test_01_create_prom_for_survey(self, client: httpx.Client, admin_token: str):
        """Create a fresh PROM request to get a token_uuid for testing."""
        case_id = TestPatients.case_id
        if not case_id:
            pytest.skip("No case_id from patient tests")
        # Use POST_1M to avoid dedupe conflict with PRE_OP already sent in patient tests
        resp = client.post(
            f"/patients/{case_id}/prom-alimtalk",
            json={"timepoint_code": "POST_1M", "expires_in_days": 7},
            headers=auth_headers(admin_token),
        )
        if resp.status_code == 202:
            data = resp.json()["data"]
            TestSurvey.token_uuid = data["survey_url"].split("/")[-1]
        else:
            pytest.skip(f"Could not create PROM request: {resp.status_code} {resp.text}")

    def test_02_status(self, client: httpx.Client):
        if not TestSurvey.token_uuid:
            pytest.skip("No token_uuid")
        resp = client.get(f"/survey/{TestSurvey.token_uuid}/status")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "token_status" in data
        assert data["expired"] is False

    def test_03_verify(self, client: httpx.Client):
        if not TestSurvey.token_uuid:
            pytest.skip("No token_uuid")
        resp = client.post(
            f"/survey/{TestSurvey.token_uuid}/verify",
            json={"method_code": "birth_ymd", "value": "1985-03-20"},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["verified"] is True
        assert "survey_token" in data
        TestSurvey.survey_token = data["survey_token"]

    def test_04_questions(self, client: httpx.Client):
        if not TestSurvey.survey_token:
            pytest.skip("No survey_token")
        resp = client.get(
            f"/survey/{TestSurvey.token_uuid}/questions",
            headers=auth_headers(TestSurvey.survey_token),
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total_questions"] > 0
        assert len(data["questions"]) > 0

    def test_05_save_draft(self, client: httpx.Client):
        if not TestSurvey.survey_token:
            pytest.skip("No survey_token")
        resp = client.patch(
            f"/survey/{TestSurvey.token_uuid}/save",
            json={"question_id": "vas_back", "answer_value": 4},
            headers=auth_headers(TestSurvey.survey_token),
        )
        assert resp.status_code == 200

    def test_06_submit(self, client: httpx.Client):
        if not TestSurvey.survey_token:
            pytest.skip("No survey_token")
        answers = {
            "vas_back": 4, "vas_leg": 2,
            "odi_q1": 1, "odi_q2": 2, "odi_q3": 1, "odi_q4": 1, "odi_q5": 2,
            "odi_q6": 1, "odi_q7": 2, "odi_q8": 1, "odi_q9": 1, "odi_q10": 2,
            "eq5d_q1": 1, "eq5d_q2": 1, "eq5d_q3": 2, "eq5d_q4": 2, "eq5d_q5": 1,
            "eq_vas": 80,
        }
        resp = client.post(
            f"/survey/{TestSurvey.token_uuid}/submit",
            json={"answers": answers},
            headers=auth_headers(TestSurvey.survey_token),
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["is_completed"] is True

    def test_07_already_submitted(self, client: httpx.Client):
        """Survey should reject double submission."""
        if not TestSurvey.survey_token:
            pytest.skip("No survey_token")
        resp = client.post(
            f"/survey/{TestSurvey.token_uuid}/submit",
            json={"answers": {"vas_back": 5}},
            headers=auth_headers(TestSurvey.survey_token),
        )
        assert resp.status_code == 409


# ──────────────────────────────────────────
# Admin
# ──────────────────────────────────────────
class TestAdmin:
    def test_list_users(self, client: httpx.Client, admin_token: str):
        resp = client.get("/admin/users?page=1&size=10", headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["pagination"]["total_elements"] >= 1


# ──────────────────────────────────────────
# Error handling
# ──────────────────────────────────────────
class TestErrorHandling:
    def test_404_route(self, client: httpx.Client, admin_token: str):
        resp = client.get("/nonexistent", headers=auth_headers(admin_token))
        assert resp.status_code == 404

    def test_validation_error(self, client: httpx.Client):
        resp = client.post("/auth/login", json={"login_id": "ab", "password": "short"})
        assert resp.status_code == 422
        assert resp.json()["error_code"] == "REQUEST_VALIDATION_ERROR"
