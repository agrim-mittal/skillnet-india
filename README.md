# SkillNet India — AI-Powered National Skill Intelligence & Workforce Planning Platform

SkillNet compares **industry skill demand** (job postings, parsed with NLP) with **workforce skill supply**
(PLFS labour survey + ITI/polytechnic output) to find **regional skill gaps**, **forecast** where they are
heading, and **recommend** what to train, where, and at what cost. All of it is shown on an interactive India map.

```
Job postings ──► NLP skill extraction ──► Title → NCO-2015 occupation ──┐
PLFS workforce ─► jobseeker & worker skills ────────────────────────────┼─► Skill Gap Index (state × skill)
ITIs/polytechnics ─► annual trained output ─────────────────────────────┘          │
Monthly postings ─► ETS / XGBoost / GRU (backtested) ─► 12-month demand forecast ──┤
                                                                                   ▼
                     Priority index · LP budget optimiser · what-if simulator · career paths · AI assistant
```

## Pages (9)

| Section | Page | What it does |
|---|---|---|
| Overview | **India Skill Map** | Clickable, zoomable map; layers: Gap Index now / in 12 months, job demand, skilled workforce, demand growth; ITI points; district drill-down; 3D demand towers |
| Skill intelligence | **Skill Gap Analysis** | Shortage/surplus ranking, state × sector heatmap, full gap table with evidence levels |
| | **Demand & Forecasts** | 12-month forecast with 80% interval per skill or state × sector; rising/declining skills; NLP-discovered emerging terms |
| | **Training Infrastructure** | 18.6k ITIs/polytechnics on the map, training coverage per skill, "training deserts" |
| Decision intelligence | **Priority Recommendations** | Editable policy weights → ranked state × skill list with score breakdown; budget optimiser (₹ crore → trainees, placements); CSV export |
| | **What-If Simulator** | "What if Punjab trains 10,000 solar technicians?" → gap closed, cost per placement, 24-month projection, better uses of the same budget |
| User services | **Student Career Path** | Skills you have → closest careers, match %, ordered learning path (Skill2Vec), pay, where jobs are, nearby centres |
| | **AI Skill Assistant** | Chat answers grounded in the platform's data (offline engine; LLM tool-calling agent when a key is set) |
| Others | **Data & Methodology** | Provenance (real vs synthetic), model cards with metrics, forecast backtest, assumptions, limitations |

"Export report" (top bar) prints a state brief.

## Quick start

```bash
# 1. Python pipeline (≈6 min on 2 CPUs) → data/processed/*.parquet + frontend/public/data/*.json
pip install -r requirements.txt
python -m pipeline.run_all

# 2. Web app
cd frontend && npm install && npm run dev          # http://localhost:5173   (static mode, no backend needed)

# 3. API (optional: assistant LLM agent, optimiser LP, simulator, PostGIS)
uvicorn backend.app.main:app --port 8000           # docs at http://localhost:8000/docs
VITE_API_URL=http://localhost:8000 npm run dev      # web app uses the API

# or everything in containers (PostGIS + API serving the built app)
docker compose up --build                           # http://localhost:8000
```

Set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` + `OPENAI_BASE_URL` for any OpenAI-compatible model) to turn on the LLM agent.

## Login and roles

Everyone signs in first. Four roles see different pages; the API enforces the same rules.

| Role | Pages | API access |
|---|---|---|
| Government | All 9 pages | Everything, incl. budget optimiser |
| College / Training provider | Map, Skill Gap, Demand, Training, Simulator, Career, Assistant, Methodology | Data, simulator, career, assistant |
| Industry / Employer | Map, Skill Gap, Demand, Training, Assistant, Methodology | Data, assistant |
| Student / Job seeker | Map, Demand, Career, Assistant, Methodology | Data, career, assistant |

- **Authentication:** passwords hashed with PBKDF2-SHA256 (200k iterations, per-user salt); sessions are signed JWTs (HS256) that expire after 12 hours; 5 wrong passwords in 5 minutes locks the email for 15 minutes.
- **Authorisation:** every protected endpoint checks the token's role (`require_roles` in `backend/app/auth.py`); the web app hides pages a role can't open and redirects if one is typed in.
- **Government accounts** can't be self-registered: they need `GOV_INVITE_CODE`, set on the server.
- **Demo accounts** (password `Demo@123`): govt@skillnet.in, college@skillnet.in, industry@skillnet.in, student@skillnet.in. Turn off with `DEMO_ACCOUNTS=0`.
- **Users** are stored in SQLite (`USERS_DB`, default `data/users.db`). On Render's free plan the disk resets on each deploy, so registered users are wiped (demo accounts come back); attach a persistent disk or move users to Postgres for production.
- **Static hosting** (claude.ai preview, GitHub Pages) has no server, so the login runs in **demo mode**: simulated in the browser, labelled as such, protecting nothing.
- **Env vars:** `JWT_SECRET` (Render generates it), `GOV_INVITE_CODE`, `USERS_DB`, `DEMO_ACCOUNTS`, `TOKEN_HOURS`, `CORS_ORIGINS`, `LLM_TIMEOUT`.

Tests: `python -m pytest tests -q` (login, registration rules, lock-out, role permissions, assistant fallback).

## Deploy

| Option | What you get | Steps |
|---|---|---|
| **GitHub Pages** (free, static) | The full dashboard; assistant uses its offline engine | Push to GitHub → Settings › Pages › Source: *GitHub Actions*. `.github/workflows/pages.yml` builds and publishes on every push to `main`. |
| **Render** (free, full stack) | Dashboard + API at one URL (`/api/docs`), LLM assistant if you add a key | Push to GitHub → render.com › New › **Blueprint** → pick the repo. `render.yaml` builds the `Dockerfile`. Optionally set `ANTHROPIC_API_KEY`. The free plan sleeps when idle, so the first visit takes about a minute. |
| Any Docker host (Railway, Fly, a VM) | Same as Render | `docker build -t skillnet . && docker run -p 8000:8000 skillnet` (honours `$PORT`) |

The production image installs only `requirements-api.txt` (no PyTorch etc.). The pipeline outputs in `data/processed/` and
`frontend/public/data/` are committed, so the server doesn't need to rerun the ML pipeline.

## Using the real datasets

Put files here and rerun `python -m pipeline.run_all`. The loaders replace the synthetic tables automatically.

| File | Goes in | Notes |
|---|---|---|
| Kaggle *Indian Job Market Dataset 2025-2026* (CSV) | `data/raw/jobs/` | columns auto-detected (title, description, skills, location, date, salary) |
| Kaggle *Job Listing Dataset* (CSV) | `data/raw/jobs/` | same loader |
| PLFS person-level file (e.g. `cperv1`, CSV / DTA) | `data/raw/plfs/` | edit `PLFS_COLUMNS` in `pipeline/ingest.py` if a round renames fields |
| ITI / polytechnic list (optional) | `data/raw/training_centres.csv` | `name,type,state,district,lat,lon,trades,seats` |

## Repository layout

```
pipeline/      reference.py (taxonomy, NCO-2015, ITI trades, PLFS codes) · geo.py · ingest.py · synth.py
               nlp.py · occupation.py · gap.py · forecast.py · recommend.py · run_all.py
backend/app/   main.py (FastAPI) · data.py · assistant.py (LLM tool-calling agent)
db/            schema.sql (PostGIS) · load_postgis.py
frontend/      React + Vite + Tailwind + MapLibre GL + Recharts
docs/          DATASETS_AND_MODELS.md (what we used and why)
data/          external/ (real public data) · raw/ (your files) · processed/ (pipeline output)
```

## Important

This build's multi-sector job postings, PLFS-format workforce sample and ITI list are **synthetic**.
They were generated to the real schemas because Kaggle and the MoSPI microdata portal could not be reached when it was built.
The method, code and UI are real; the numbers illustrate the method until you load the real files.
Every synthetic table is labelled as synthetic in the app.
