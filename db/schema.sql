-- SkillNet India: PostGIS schema (used when DATABASE_URL is set; the API also runs without a database)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS districts (
  dt_code    TEXT PRIMARY KEY,
  district   TEXT NOT NULL,
  state      TEXT NOT NULL,
  pop2011    BIGINT,
  geom       GEOMETRY(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS districts_geom_idx ON districts USING GIST (geom);

CREATE TABLE IF NOT EXISTS training_centres (
  centre_id   TEXT PRIMARY KEY,
  name        TEXT,
  type        TEXT,            -- Govt ITI | Private ITI | Polytechnic
  state       TEXT,
  dt_code     TEXT REFERENCES districts(dt_code),
  district    TEXT,
  trades      TEXT,            -- '|' separated DGT trade names
  skills      TEXT,            -- '|' separated taxonomy skills
  seats       INT,
  utilisation REAL,
  source      TEXT,
  geom        GEOMETRY(Point, 4326)
);
CREATE INDEX IF NOT EXISTS centres_geom_idx ON training_centres USING GIST (geom);

CREATE TABLE IF NOT EXISTS postings (
  job_id TEXT PRIMARY KEY, source TEXT, title TEXT, company TEXT, state TEXT, dt_code TEXT, city TEXT,
  posted DATE, skills TEXT[], nco TEXT, cluster TEXT, salary_min_lpa REAL, salary_max_lpa REAL, exp_min REAL
);
CREATE INDEX IF NOT EXISTS postings_state_idx ON postings (state, posted);
CREATE INDEX IF NOT EXISTS postings_skills_idx ON postings USING GIN (skills);

CREATE TABLE IF NOT EXISTS skill_gap (
  state TEXT, skill TEXT, cluster TEXT, postings_12m INT, openings INT, available INT,
  available_jobseekers INT, available_trained INT, shortage INT, sgi REAL, employed_stock INT,
  confidence TEXT, growth_12m REAL, openings_next12 INT, sgi_next12 REAL,
  PRIMARY KEY (state, skill)
);

-- nearest centres teaching a skill (example)
-- SELECT name, ST_Distance(geom::geography, ST_MakePoint(75.85, 30.90)::geography)/1000 AS km
-- FROM training_centres WHERE skills LIKE '%Solar PV Installation%' ORDER BY geom <-> ST_MakePoint(75.85, 30.90) LIMIT 5;
