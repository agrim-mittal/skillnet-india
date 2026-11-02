"""Geography: state/district tables, city gazetteer for geocoding postings, web-ready boundaries."""
import json
import re
from functools import lru_cache

import numpy as np
import pandas as pd

from .config import EXT

STATE_ALIASES = {
    "andaman and nicobar": "Andaman and Nicobar Islands",
    "andaman & nicobar islands": "Andaman and Nicobar Islands",
    "jammu & kashmir": "Jammu and Kashmir",
    "nct of delhi": "Delhi", "new delhi": "Delhi", "delhi ncr": "Delhi",
    "orissa": "Odisha", "pondicherry": "Puducherry", "uttaranchal": "Uttarakhand",
    "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
    "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
}
# Common city spellings in job portals -> Census 2011 city names
CITY_ALIASES = {
    "bengaluru": "Bangalore", "bangalore urban": "Bangalore", "gurugram": "Gurgaon", "gurgaon": "Gurgaon",
    "mumbai": "Greater Mumbai", "bombay": "Greater Mumbai", "navi mumbai": "Navi Mumbai",
    "new delhi": "Delhi", "noida": "Noida", "greater noida": "Noida", "chennai": "Chennai",
    "kolkata": "Kolkata", "calcutta": "Kolkata", "hyderabad": "Hyderabad", "secunderabad": "Hyderabad",
    "pune": "Pune", "thiruvananthapuram": "Thiruvananthapuram", "trivandrum": "Thiruvananthapuram",
    "kochi": "Kochi", "cochin": "Kochi", "vizag": "Visakhapatnam", "mysuru": "Mysore",
    "mangaluru": "Mangalore", "vadodara": "Vadodara", "baroda": "Vadodara", "prayagraj": "Allahabad",
}


def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", str(s).lower().replace("&", "and")).strip()


_DIST_RENAMES = {"bengaluru": "bangalore", "mysuru": "mysore", "belagavi": "belgaum", "kalaburagi": "gulbarga",
                 "vijayapura": "bijapur", "shivamogga": "shimoga", "tumakuru": "tumkur", "ballari": "bellary",
                 "chikkamagaluru": "chikmagalur", "mumbai suburban": "mumbai", "gurugram": "gurgaon",
                 "sri potti sriramulu nellore": "nellore", "y s r": "ysr", "kadapa": "ysr"}


def dnorm(s):
    n = norm(s)
    for a, b in _DIST_RENAMES.items():
        n = n.replace(a, b)
    return n


# Metros whose Census "city" rows are missing or split into municipal bodies
CITY_TO_DISTRICT = {
    "bengaluru": ("Karnataka", "Bengaluru Urban"), "bangalore": ("Karnataka", "Bengaluru Urban"),
    "delhi": ("Delhi", "Delhi"), "new delhi": ("Delhi", "Delhi"), "delhi ncr": ("Delhi", "Delhi"),
    "chennai": ("Tamil Nadu", "Chennai"), "kolkata": ("West Bengal", "Kolkata"),
    "mumbai": ("Maharashtra", "Mumbai"), "greater mumbai": ("Maharashtra", "Mumbai"),
    "hyderabad": ("Telangana", "Hyderabad"), "secunderabad": ("Telangana", "Hyderabad"),
    "kochi": ("Kerala", "Ernakulam"), "cochin": ("Kerala", "Ernakulam"),
    "visakhapatnam": ("Andhra Pradesh", "Visakhapatnam"), "vizag": ("Andhra Pradesh", "Visakhapatnam"),
}


@lru_cache(None)
def states():
    df = pd.read_csv(EXT / "final_states.csv").rename(
        columns={"State/UT": "state", "Population": "pop2011", "Area (in km^2)": "area_km2",
                 "Latitude": "lat", "Longitude": "lon", "#Districts": "n_districts"})
    cities = pd.read_csv(EXT / "final_cities.csv")
    cities["State"] = cities["State"].replace({"Jammu & Kashmir": "Jammu and Kashmir", "Andaman and Nicobar": "Andaman and Nicobar Islands"})
    urb = cities.groupby("State")["Population"].sum()
    df["city_pop"] = df["state"].map(urb).fillna(0)
    df["urban_share"] = (df["city_pop"] / df["pop2011"]).clip(0.02, 0.95)
    df["state_id"] = np.arange(len(df))
    return df


def canon_state(s):
    if s is None or (isinstance(s, float) and np.isnan(s)):
        return None
    n = norm(s)
    if n in STATE_ALIASES:
        return STATE_ALIASES[n]
    lookup = {norm(x): x for x in states()["state"]}
    if n in lookup:
        return lookup[n]
    for k, v in STATE_ALIASES.items():
        if k in n:
            return v
    for k, v in lookup.items():
        if k and k in n:
            return v
    return None


@lru_cache(None)
def districts_geo():
    """District polygons, one feature per district code. Unnamed fragments are kept only for state outlines."""
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union

    raw = json.load(open(EXT / "india_districts_2011.geojson"))
    groups, names, fragments = {}, {}, []
    for f in raw["features"]:
        p = f["properties"]
        code, name = p.get("dt_code"), p.get("district")
        geom = shape(f["geometry"]).buffer(0)
        if not name:
            fragments.append((p["st_nm"], geom))
            continue
        if not code or code == "0":
            code = f"S{p.get('st_code', '00')}_{norm(name)[:12]}"
        key = (code, p["st_nm"])
        groups.setdefault(key, []).append(geom)
        names[key] = name
    feats = []
    for (code, st), geoms in groups.items():
        feats.append({"type": "Feature", "properties": {"dt_code": f"{code}" if list(k[0] for k in groups).count(code) == 1 else f"{code}_{norm(st)[:4]}",
                                                       "district": names[(code, st)], "st_nm": st},
                      "geometry": mapping(unary_union(geoms))})
    return {"type": "FeatureCollection", "features": feats, "fragments": [(s, mapping(g)) for s, g in fragments]}


@lru_cache(None)
def districts():
    """District table keyed by Census-2011 district code, with population from Census tables."""
    g = districts_geo()
    rows = []
    for f in g["features"]:
        p = f["properties"]
        rows.append({"dt_code": p["dt_code"], "district": p["district"], "state": p["st_nm"]})
    df = pd.DataFrame(rows).drop_duplicates("dt_code")
    pop = pd.read_csv(EXT / "final_districts.csv")
    pop["State"] = pop["State"].replace({"Andaman and Nicobar": "Andaman and Nicobar Islands"})
    for c in ("Population", "Latitude", "Longitude"):
        pop[c] = pd.to_numeric(pop[c].astype(str).str.replace(",", ""), errors="coerce")
    pop = pop.drop_duplicates(subset=["State", "District"])
    pop["key"] = pop["State"].map(norm) + "|" + pop["District"].map(dnorm)
    df["key"] = df["state"].map(norm) + "|" + df["district"].map(dnorm)
    pop = pop.groupby("key", as_index=False).agg({"Population": "sum", "Latitude": "mean", "Longitude": "mean"})
    df = df.merge(pop[["key", "Population", "Latitude", "Longitude"]], on="key", how="left")
    # districts carved out after 2011 or spelled differently: share the state's unmatched population evenly
    st = states().set_index("state")["pop2011"]
    for s, grp in df.groupby("state"):
        missing = grp["Population"].isna()
        if missing.any():
            rest = max(st.get(s, 0) - grp["Population"].sum(), 0)
            df.loc[grp.index[missing], "Population"] = max(rest / missing.sum(), 50000)
    df = df.rename(columns={"Population": "pop2011", "Latitude": "lat", "Longitude": "lon"}).drop(columns="key")
    # fill centroid from geometry where Census coords missing
    cent = {}
    for f in g["features"]:
        coords = np.array(_flatten(f["geometry"]))
        cent[f["properties"]["dt_code"]] = coords.mean(axis=0)
    df["lon"] = df["lon"].fillna(df["dt_code"].map(lambda c: cent[c][0]))
    df["lat"] = df["lat"].fillna(df["dt_code"].map(lambda c: cent[c][1]))
    return df.reset_index(drop=True)


def _flatten(geom):
    t, c = geom["type"], geom["coordinates"]
    if t == "Polygon":
        return [pt for ring in c[:1] for pt in ring]
    return [pt for poly in c for pt in poly[0]]


@lru_cache(None)
def gazetteer():
    """city name -> (state, district code). Built from Census 2011 cities matched to district polygons by name."""
    cities = pd.read_csv(EXT / "final_cities.csv")
    cities["State"] = cities["State"].replace({"Jammu & Kashmir": "Jammu and Kashmir", "Andaman and Nicobar": "Andaman and Nicobar Islands"})
    d = districts()
    dkey = {(norm(r.state), dnorm(r.district)): r.dt_code for r in d.itertuples()}
    gaz = {}
    for r in cities.itertuples():
        code = dkey.get((norm(r.State), dnorm(r.District)))
        if code is None:  # nearest district centroid in same state
            sub = d[d.state == r.State]
            if len(sub):
                i = ((sub.lat - r.Latitude) ** 2 + (sub.lon - r.Longitude) ** 2).idxmin()
                code = sub.loc[i, "dt_code"]
        gaz[norm(r.City)] = (r.State, code, int(r.Population))
    for r in d.itertuples():  # district headquarters names also work as cities
        gaz.setdefault(norm(r.district), (r.state, r.dt_code, int(r.pop2011)))
    for alias, city in CITY_ALIASES.items():
        if norm(city) in gaz:
            gaz[alias] = gaz[norm(city)]
    for city, (st, dist) in CITY_TO_DISTRICT.items():
        m = d[(d.state == st) & (d.district == dist)]
        if len(m):
            gaz[city] = (st, m.iloc[0].dt_code, int(m.iloc[0].pop2011))
    return gaz


def geocode(city=None, state=None):
    """Return (state, dt_code) for a free-text city/state pair. dt_code may be None (state-level only)."""
    gaz = gazetteer()
    for part in re.split(r"[,/|;]", str(city or "")):
        n = norm(part)
        if n in gaz:
            return gaz[n][0], gaz[n][1]
        if n in CITY_ALIASES and norm(CITY_ALIASES[n]) in gaz:
            g = gaz[norm(CITY_ALIASES[n])]
            return g[0], g[1]
    return canon_state(state) or canon_state(city), None


def web_geojson(simplify_tol=0.02):
    """Simplified district + dissolved state boundaries for the web map (uses shapely)."""
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union

    g = districts_geo()
    dist_feats, by_state = [], {}
    for f in g["features"]:
        geom = shape(f["geometry"]).buffer(0)
        p = f["properties"]
        by_state.setdefault(p["st_nm"], []).append(geom)
        s = geom.simplify(simplify_tol, preserve_topology=True)
        dist_feats.append({"type": "Feature", "properties": {"dt_code": p["dt_code"], "district": p["district"], "state": p["st_nm"]},
                           "geometry": _round(mapping(s))})
    for st, frag in g.get("fragments", []):
        by_state.setdefault(st, []).append(shape(frag))
    st_feats = []
    for st, geoms in by_state.items():
        u = unary_union(geoms).simplify(simplify_tol, preserve_topology=True)
        st_feats.append({"type": "Feature", "properties": {"state": st}, "geometry": _round(mapping(u))})
    return ({"type": "FeatureCollection", "features": st_feats},
            {"type": "FeatureCollection", "features": dist_feats})


def _round(geom, nd=3):
    def r(c):
        if isinstance(c[0], (float, int)):
            return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    return {"type": geom["type"], "coordinates": r(geom["coordinates"])}
