"""Load pipeline outputs into PostGIS.   DATABASE_URL=postgresql://user:pass@host/db python db/load_postgis.py"""
import json
import os
import sys
from pathlib import Path

import pandas as pd
import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pipeline import geo  # noqa: E402

PROC = ROOT / "data" / "processed"


def main():
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as con:
        con.execute((ROOT / "db" / "schema.sql").read_text())
        g = geo.districts_geo()
        pops = geo.districts().set_index("dt_code")["pop2011"]
        with con.cursor() as cur:
            for f in g["features"]:
                p = f["properties"]
                cur.execute("""INSERT INTO districts VALUES (%s,%s,%s,%s, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)))
                               ON CONFLICT (dt_code) DO NOTHING""",
                            (p["dt_code"], p["district"], p["st_nm"], int(pops.get(p["dt_code"], 0)), json.dumps(f["geometry"])))
            c = pd.read_parquet(PROC / "centres.parquet")
            known = set(pops.index)
            for r in c.itertuples():
                cur.execute("""INSERT INTO training_centres VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, ST_SetSRID(ST_MakePoint(%s,%s),4326))
                               ON CONFLICT (centre_id) DO NOTHING""",
                            (r.centre_id, r.name, r.type, r.state, r.dt_code if r.dt_code in known else None, r.district, r.trades,
                             r.skills, int(r.seats), float(r.utilisation), r.source, float(r.lon), float(r.lat)))
            gp = pd.read_parquet(PROC / "gap.parquet")
            cols = ["state", "skill", "cluster", "postings_12m", "openings", "available", "available_jobseekers", "available_trained",
                    "shortage", "sgi", "employed_stock", "confidence", "growth_12m", "openings_next12", "sgi_next12"]
            cur.executemany(f"INSERT INTO skill_gap ({','.join(cols)}) VALUES ({','.join(['%s'] * len(cols))}) ON CONFLICT DO NOTHING",
                            [tuple(x.item() if hasattr(x, "item") else x for x in row) for row in gp[cols].itertuples(index=False)])
            jobs = pd.read_parquet(PROC / "postings.parquet")
            with cur.copy("COPY postings (job_id, source, title, company, state, dt_code, city, posted, skills, nco, cluster, salary_min_lpa, salary_max_lpa, exp_min) FROM STDIN") as cp:
                for r in jobs.itertuples():
                    cp.write_row((r.job_id, r.source, r.title, r.company, r.state, r.dt_code, r.city, r.date.date() if pd.notna(r.date) else None,
                                  list(r.skills), r.nco, r.cluster, r.salary_min_lpa, r.salary_max_lpa, r.exp_min))
    print("loaded")


if __name__ == "__main__":
    main()
