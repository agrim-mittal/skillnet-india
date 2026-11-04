"""API tests: authentication, role-based authorisation, assistant fallback.  Run: python -m pytest tests -q"""
import os
import tempfile

os.environ["USERS_DB"] = os.path.join(tempfile.mkdtemp(), "users.db")
os.environ["JWT_SECRET"] = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz"
os.environ["GOV_INVITE_CODE"] = "GOV-2026"
os.environ.pop("ANTHROPIC_API_KEY", None); os.environ.pop("OPENAI_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402
from backend.app.main import app  # noqa: E402

c = TestClient(app)


def login(email, pw="Demo@123"):
    r = c.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_health_is_public():
    r = c.get("/api/health")
    assert r.status_code == 200 and r.json()["auth"] == "jwt"


def test_demo_accounts_and_me():
    h = login("student@skillnet.in")
    me = c.get("/api/auth/me", headers=h).json()
    assert me["role"] == "student" and "career" in me["pages"] and "priority" not in me["pages"]


def test_wrong_password_and_lockout():
    for _ in range(5):
        assert c.post("/api/auth/login", json={"email": "industry@skillnet.in", "password": "nope"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "industry@skillnet.in", "password": "Demo@123"}).status_code == 429


def test_register_student_and_password_rules():
    assert c.post("/api/auth/register", json={"name": "Asha", "email": "asha@x.in", "password": "short", "role": "student"}).status_code == 422
    assert c.post("/api/auth/register", json={"name": "Asha", "email": "asha@x.in", "password": "longbutnodigits", "role": "student"}).status_code == 400
    r = c.post("/api/auth/register", json={"name": "Asha", "email": "Asha@X.in", "password": "Learn2026", "role": "student", "state": "Punjab"})
    assert r.status_code == 200 and r.json()["user"]["email"] == "asha@x.in"
    assert c.post("/api/auth/register", json={"name": "Asha", "email": "asha@x.in", "password": "Learn2026", "role": "student"}).status_code == 409


def test_government_needs_invite_code():
    body = {"name": "Officer", "email": "o@gov.in", "password": "Policy2026", "role": "government"}
    assert c.post("/api/auth/register", json=body).status_code == 403
    assert c.post("/api/auth/register", json={**body, "invite_code": "wrong"}).status_code == 403
    assert c.post("/api/auth/register", json={**body, "invite_code": "GOV-2026"}).status_code == 200


def test_endpoints_need_login():
    assert c.get("/api/gap?state=Punjab").status_code == 401
    assert c.post("/api/simulate", json={"state": "Punjab", "skill": "solar", "trainees": 100}).status_code == 401
    assert c.get("/api/gap?state=Punjab", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


def test_role_permissions():
    stu, col, gov = login("student@skillnet.in"), login("college@skillnet.in"), login("govt@skillnet.in")
    sim = {"state": "Punjab", "skill": "solar", "trainees": 1000}
    assert c.post("/api/optimise", json={"budget_inr": 1e9}, headers=stu).status_code == 403
    assert c.post("/api/optimise", json={"budget_inr": 1e9}, headers=col).status_code == 403
    assert c.post("/api/optimise", json={"budget_inr": 1e9}, headers=gov).status_code == 200
    assert c.post("/api/simulate", json=sim, headers=stu).status_code == 403
    assert c.post("/api/simulate", json=sim, headers=col).status_code == 200
    assert c.post("/api/career", json={"role": "electrician", "skills": []}, headers=stu).status_code == 200
    assert c.get("/api/gap?state=Punjab", headers=stu).status_code == 200


def test_assistant_without_llm_tells_app_to_fall_back():
    r = c.post("/api/assistant", json={"question": "hi"}, headers=login("college@skillnet.in"))
    assert r.status_code == 503
