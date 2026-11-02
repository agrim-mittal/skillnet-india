"""Loaders for real data. Put files in data/raw/ and run `python -m pipeline.run_all`.

data/raw/jobs/*.csv        any job-postings CSV (e.g. Kaggle "Indian Job Market Dataset 2025-2026",
                           Kaggle "Job Listing Dataset"). Columns are auto-detected (title, description,
                           skills, location, date, salary). Each file is tagged with its file name as source.
data/raw/plfs/*.csv|.dta|.parquet   PLFS person-level file (e.g. cperv1 for a calendar year). Column names
                           differ across rounds: edit PLFS_COLUMNS below if detection fails.
data/raw/training_centres.csv       columns: name,type,state,district,lat,lon,trades|skills,seats[,utilisation]
"""
import re
from pathlib import Path

import numpy as np
import pandas as pd

from . import geo
from .config import EXT, RAW

JOB_COLS = {
    "title": ["job_title", "title", "jobtitle", "designation", "role", "position"],
    "description": ["job_description", "description", "jobdescription", "jd", "job_desc", "summary"],
    "key_skills": ["key_skills", "skills", "tagsandskills", "tags", "skill", "required_skills"],
    "location": ["location", "job_location", "joblocation_address", "city", "locations"],
    "state": ["state"],
    "date": ["date_posted", "posted_date", "postdate", "post_date", "created_date", "createddate", "date", "posted_on"],
    "salary": ["salary", "payrate", "ctc", "salary_range", "package", "salarylabel"],
    "company": ["company", "company_name", "companyname", "employer"],
    "experience": ["experience", "exp", "experience_required", "experiencelabel"],
}
PLFS_COLUMNS = {   # canonical -> candidate names seen in PLFS releases
    "State": ["State", "state", "State_Ut_Code", "b1q3", "ST"],
    "District": ["District", "district", "b1q5", "DIST"],
    "Sector": ["Sector", "sector", "b1q4"],
    "Sex": ["Sex", "sex", "b4q5"],
    "Age": ["Age", "age", "b4q6"],
    "General_Education_Level": ["General_Education_Level", "General_Educaion_Level", "gen_edu", "b4q8"],
    "Technical_Education_Level": ["Technical_Education_Level", "Technical_Educaion_Level", "tech_edu", "b4q9"],
    "Vocational_Training": ["Vocational_Training", "voc", "b4q12"],
    "Field_of_Training": ["Field_of_Training", "voc_field", "Field_Of_Training", "b4q13"],
    "Principal_Status_Code": ["Principal_Status_Code", "Status_Code", "ps_status", "b5pt1q3"],
    "NCO_2015_3d": ["NCO_2015_3d", "Occupation_Code", "NCO", "nco", "b5pt1q6"],
    "Multiplier": ["Multiplier", "MULT", "mult", "Subsample_Multiplier", "weight"],
}
PLFS_STATE_CODES = {  # PLFS state codes (Census order); used when the State column is numeric
    1: "Jammu and Kashmir", 2: "Himachal Pradesh", 3: "Punjab", 4: "Chandigarh", 5: "Uttarakhand", 6: "Haryana", 7: "Delhi",
    8: "Rajasthan", 9: "Uttar Pradesh", 10: "Bihar", 11: "Sikkim", 12: "Arunachal Pradesh", 13: "Nagaland", 14: "Manipur",
    15: "Mizoram", 16: "Tripura", 17: "Meghalaya", 18: "Assam", 19: "West Bengal", 20: "Jharkhand", 21: "Odisha",
    22: "Chhattisgarh", 23: "Madhya Pradesh", 24: "Gujarat", 25: "Dadra and Nagar Haveli and Daman and Diu",
    26: "Dadra and Nagar Haveli and Daman and Diu", 27: "Maharashtra", 28: "Andhra Pradesh", 29: "Karnataka", 30: "Goa",
    31: "Lakshadweep", 32: "Kerala", 33: "Tamil Nadu", 34: "Puducherry", 35: "Andaman and Nicobar Islands", 36: "Telangana",
    37: "Ladakh",
}


def _pick(cols, cands):
    low = {c.lower().replace(" ", "_"): c for c in cols}
    for c in cands:
        if c.lower() in low:
            return low[c.lower()]
    return None


def parse_salary_lpa(s):
    """'3-6 Lacs P.A.', '₹4,00,000 - 6,00,000', '12 LPA', '25000/month' -> (min, max) in lakh per annum."""
    if not isinstance(s, str) or not re.search(r"\d", s):
        return np.nan, np.nan
    t = s.lower().replace(",", "")
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", t)]
    if not nums:
        return np.nan, np.nan
    lo, hi = nums[0], nums[1] if len(nums) > 1 else nums[0]
    if "month" in t or "/m" in t or "pm" in t.split():
        lo, hi = lo * 12 / 1e5, hi * 12 / 1e5
    elif "lac" in t or "lakh" in t or "lpa" in t:
        pass
    elif lo > 1000:
        lo, hi = lo / 1e5, hi / 1e5
    if hi > 500 or lo <= 0:
        return np.nan, np.nan
    return lo, hi


def load_job_csv(path):
    df = pd.read_csv(path, low_memory=False)
    out = pd.DataFrame(index=df.index)
    for k, cands in JOB_COLS.items():
        c = _pick(df.columns, cands)
        out[k] = df[c] if c else None
    out["key_skills"] = out["key_skills"].astype(str).str.replace(r"[\[\]'\"]", "", regex=True).replace("None", "")
    loc = out["location"].astype(str)
    geo_ = [geo.geocode(l, s) for l, s in zip(loc, out["state"])]
    out["state"] = [g[0] for g in geo_]
    out["dt_code"] = [g[1] for g in geo_]
    out["city"] = loc.str.split(",").str[0]
    out["date"] = pd.to_datetime(out["date"], errors="coerce")
    sal = out["salary"].apply(parse_salary_lpa)
    out["salary_min_lpa"] = [x[0] for x in sal]
    out["salary_max_lpa"] = [x[1] for x in sal]
    out["exp_min"] = pd.to_numeric(out["experience"].astype(str).str.extract(r"(\d+)")[0], errors="coerce")
    out["source"] = f"real:{Path(path).stem}"
    out["job_id"] = out["source"] + ":" + out.index.astype(str)
    out["description"] = out["description"].fillna("").astype(str)
    out["title"] = out["title"].fillna("").astype(str)
    return out.drop(columns=["salary", "experience", "location"])


def load_github_ds_jobs():
    """Real 2025 India postings (LinkedIn/Indeed, data & analytics roles) mirrored on GitHub."""
    p = EXT / "india_ds_jobs_2025.csv"
    df = pd.read_csv(p)
    out = pd.DataFrame({
        "job_id": "R" + df["id"].astype(str), "title": df["title"].fillna(""), "company": df["company"],
        "description": df["description"].fillna("").astype(str), "key_skills": "",
        "reference_skills": df["extracted_skills"], "city": df["city"],
        "date": pd.to_datetime(df["date_posted"], errors="coerce"),
        "salary_min_lpa": np.nan, "salary_max_lpa": np.nan,
        "exp_min": pd.to_numeric(df["experience_years"].astype(str).str.extract(r"(\d+)")[0], errors="coerce"),
        "source": "real:linkedin_indeed_2025",
    })
    g = [geo.geocode(c, s) for c, s in zip(df["city"], df["state"])]
    out["state"] = [x[0] for x in g]
    out["dt_code"] = [x[1] for x in g]
    return out


def real_job_files():
    return sorted((RAW / "jobs").glob("*.csv")) if (RAW / "jobs").exists() else []


def load_plfs():
    files = sorted((RAW / "plfs").glob("*")) if (RAW / "plfs").exists() else []
    if not files:
        return None
    frames = []
    for f in files:
        if f.suffix == ".dta":
            d = pd.read_stata(f, convert_categoricals=False)
        elif f.suffix == ".parquet":
            d = pd.read_parquet(f)
        else:
            d = pd.read_csv(f, low_memory=False)
        out = pd.DataFrame()
        for k, cands in PLFS_COLUMNS.items():
            c = _pick(d.columns, cands)
            out[k] = d[c] if c else np.nan
        frames.append(out)
    df = pd.concat(frames, ignore_index=True)
    if pd.api.types.is_numeric_dtype(df["State"]):
        df["State"] = df["State"].astype(int).map(PLFS_STATE_CODES)
    for c in ["Sector", "Sex", "Age", "General_Education_Level", "Technical_Education_Level", "Vocational_Training",
              "Field_of_Training", "Principal_Status_Code", "Multiplier"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    df["NCO_2015_3d"] = pd.to_numeric(df["NCO_2015_3d"].astype(str).str[:3], errors="coerce")
    if df["Multiplier"].median() > 1e5:   # some rounds store MULT x 100
        df["Multiplier"] = df["Multiplier"] / 100
    df["source"] = "real:plfs"
    return df.dropna(subset=["State"])


def load_centres():
    p = RAW / "training_centres.csv"
    if not p.exists():
        return None
    df = pd.read_csv(p)
    df["state"] = df["state"].map(geo.canon_state)
    if "utilisation" not in df:
        df["utilisation"] = 0.75
    if "skills" not in df:
        from .reference import ITI_TRADES
        df["skills"] = df["trades"].fillna("").map(lambda t: "|".join(sorted({s for x in t.split("|") for s in ITI_TRADES.get(x.strip(), [])})))
    df["source"] = "real:training_centres"
    return df
