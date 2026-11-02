from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "raw"            # drop real files here (see README)
EXT = DATA / "external"       # public reference data fetched from GitHub
PROC = DATA / "processed"
WEB = ROOT / "frontend" / "public" / "data"

SEED = 42
HISTORY_START = "2021-01"
HISTORY_END = "2026-10"       # last complete month
SNAPSHOT_MONTHS = 12          # demand snapshot window for the gap index
FORECAST_H = 12               # months ahead

# ---- Assumptions used to convert postings into persons (shown in the UI, editable in the simulator)
ANNUAL_HIRE_RATE = 0.07       # share of non-farm workers hired per year (churn + growth)
ITI_PASS_RATE = 0.75
DEFAULT_COMPLETION = 0.80     # trainees completing a course
DEFAULT_PLACEMENT = 0.55      # completers placed in a job using the skill
MIN_POSTINGS_CONFIDENT = 25   # below this the gap estimate is flagged low-confidence

for p in (RAW, PROC, WEB):
    p.mkdir(parents=True, exist_ok=True)
