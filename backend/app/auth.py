"""Authentication (who are you) and authorisation (what may you do) for SkillNet India.

- Passwords: PBKDF2-HMAC-SHA256, 200,000 iterations, random 16-byte salt per user (Python standard library).
- Sessions: signed JWT (HS256) with the user's id, name and role; expires after 12 hours.
- Roles: government, college, industry, student. Each role can open certain pages and call certain APIs.
- Government accounts can't be self-registered: they need GOV_INVITE_CODE (set on the server).
- Brute-force guard: 5 failed logins per email in 5 minutes -> 15-minute lock-out.
- Users live in SQLite (USERS_DB, default data/users.db). Demo accounts are created on start-up unless DEMO_ACCOUNTS=0.

Env: JWT_SECRET (required in production), GOV_INVITE_CODE, USERS_DB, DEMO_ACCOUNTS, TOKEN_HOURS.
"""
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.getenv("USERS_DB", ROOT / "data" / "users.db"))
SECRET = os.getenv("JWT_SECRET") or secrets.token_urlsafe(48)   # random fallback: sessions end on restart
SECRET_IS_EPHEMERAL = not os.getenv("JWT_SECRET")
TOKEN_HOURS = float(os.getenv("TOKEN_HOURS", "12"))
ITERATIONS = 200_000

# role -> pages it can open (mirrors frontend/src/roles.js) and what it is for
ROLES = {
    "government": {"label": "Government", "pages": ["map", "gap", "demand", "training", "priority", "simulator", "career", "assistant", "method"]},
    "college": {"label": "College / Training provider", "pages": ["map", "gap", "demand", "training", "simulator", "career", "assistant", "method"]},
    "industry": {"label": "Industry / Employer", "pages": ["map", "gap", "demand", "training", "assistant", "method"]},
    "student": {"label": "Student / Job seeker", "pages": ["map", "demand", "career", "assistant", "method"]},
}
SELF_SERVICE_ROLES = {"college", "industry", "student"}
DEMO_USERS = [
    ("Government Officer (demo)", "govt@skillnet.in", "government"),
    ("College Admin (demo)", "college@skillnet.in", "college"),
    ("Industry HR (demo)", "industry@skillnet.in", "industry"),
    ("Student (demo)", "student@skillnet.in", "student"),
]
DEMO_PASSWORD = "Demo@123"

_lock = threading.Lock()
_failures = {}   # email -> [timestamps]


# ------------------------------------------------------------------ storage
def _db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with _lock, _db() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, role TEXT NOT NULL, organisation TEXT, state TEXT,
            created_at REAL NOT NULL)""")
        if os.getenv("DEMO_ACCOUNTS", "1") != "0":
            for name, email, role in DEMO_USERS:
                con.execute("INSERT OR IGNORE INTO users (name, email, password_hash, role, organisation, created_at) VALUES (?,?,?,?,?,?)",
                            (name, email, hash_password(DEMO_PASSWORD), role, "SkillNet demo", time.time()))


def hash_password(pw):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(pw, stored):
    try:
        algo, it, salt, h = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), int(it))
        return algo == "pbkdf2_sha256" and hmac.compare_digest(dk.hex(), h)
    except Exception:
        return False


def _public(u):
    return {"id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"], "role_label": ROLES[u["role"]]["label"],
            "organisation": u["organisation"], "state": u["state"], "pages": ROLES[u["role"]]["pages"]}


def make_token(u):
    now = int(time.time())
    return jwt.encode({"sub": str(u["id"]), "name": u["name"], "role": u["role"], "iat": now, "exp": now + int(TOKEN_HOURS * 3600)},
                      SECRET, algorithm="HS256")


# ------------------------------------------------------------------ requests
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    role: str
    organisation: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=60)
    invite_code: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str


EMAIL_RX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def register(p: RegisterIn):
    email = p.email.strip().lower()
    if not EMAIL_RX.match(email):
        raise HTTPException(400, "Enter a valid email address.")
    if p.role not in ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(ROLES)}.")
    if p.role not in SELF_SERVICE_ROLES:
        code = os.getenv("GOV_INVITE_CODE")
        if not code or not p.invite_code or not hmac.compare_digest(p.invite_code, code):
            raise HTTPException(403, "Government accounts need a valid invite code from the administrator.")
    if not (re.search(r"[A-Za-z]", p.password) and re.search(r"\d", p.password)):
        raise HTTPException(400, "Password needs at least 8 characters with letters and numbers.")
    with _lock, _db() as con:
        if con.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise HTTPException(409, "An account with this email already exists. Sign in instead.")
        cur = con.execute("INSERT INTO users (name, email, password_hash, role, organisation, state, created_at) VALUES (?,?,?,?,?,?,?)",
                          (p.name.strip(), email, hash_password(p.password), p.role, p.organisation, p.state, time.time()))
        u = con.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone()
    return {"token": make_token(u), "user": _public(u)}


def login(p: LoginIn):
    email = p.email.strip().lower()
    now = time.time()
    with _lock:
        recent = [t for t in _failures.get(email, []) if now - t < 900]
        _failures[email] = recent
        if len([t for t in recent if now - t < 300]) >= 5:
            raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    with _db() as con:
        u = con.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not u or not verify_password(p.password, u["password_hash"]):
        with _lock:
            _failures.setdefault(email, []).append(now)
        raise HTTPException(401, "Wrong email or password.")
    _failures.pop(email, None)
    return {"token": make_token(u), "user": _public(u)}


_bearer = HTTPBearer(auto_error=False)


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in first.", headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid session. Sign in again.")
    with _db() as con:
        u = con.execute("SELECT * FROM users WHERE id=?", (int(claims["sub"]),)).fetchone()
    if not u:
        raise HTTPException(401, "Account no longer exists.")
    return _public(u)


def require_roles(*roles):
    def dep(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, f"The {user['role_label']} role can't use this. Allowed: {', '.join(ROLES[r]['label'] for r in roles)}.")
        return user
    return dep
