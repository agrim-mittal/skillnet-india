"""NLP: skill extraction from job descriptions, tag normalisation, skill embeddings, emerging-term discovery.

Pipeline per posting:
  1. Taxonomy matcher  - one compiled regex over 132 skills x ~520 aliases (title + description + key-skill tags)
  2. Tag normaliser    - each recruiter tag -> taxonomy skill via regex, else fuzzy match (RapidFuzz);
                         tags that match nothing are kept as candidate new terms
  3. Skill2Vec         - Word2Vec trained on the skill sequences of all postings -> skill similarity / adjacency
  4. Emerging terms    - unmatched tags whose share of postings is rising fastest (recent 6m vs prior 12m)
"""
import re
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
from rapidfuzz import fuzz, process

from .reference import SKILLS

_BOUND_L, _BOUND_R = r"(?<![\w.#+])", r"(?![\w+#])"


def _noncap(p):
    return re.sub(r"\((?!\?)", "(?:", p)


class SkillExtractor:
    def __init__(self, skills=SKILLS):
        self.skills = skills
        parts = [f"(?P<s{s['id']}>{_BOUND_L}(?:{_noncap(s['pattern'])}){_BOUND_R})" for s in skills]
        self.rx = re.compile("|".join(parts), re.I)
        self.names = {s["id"]: s["name"] for s in skills}
        choices = {}
        for s in skills:
            choices[s["name"].lower()] = s["name"]
            choices[s["name"].split(" (")[0].lower()] = s["name"]
        self._fuzzy_choices = choices

    def extract(self, text):
        if not isinstance(text, str) or not text:
            return set()
        return {self.names[int(m.lastgroup[1:])] for m in self.rx.finditer(text)}

    def normalise_tag(self, tag):
        """Recruiter tag -> (skill or None, cleaned tag)."""
        t = tag.strip()
        if not t:
            return None, ""
        hit = self.extract(t)
        if hit:
            return sorted(hit)[0], t
        m = process.extractOne(t.lower(), list(self._fuzzy_choices), scorer=fuzz.token_set_ratio, score_cutoff=92)
        if m:
            return self._fuzzy_choices[m[0]], t
        return None, t

    _SENT = re.compile(r"(?<=[.!?])\s+")

    def _extract_cached(self, text, cache):
        out = set()
        if not isinstance(text, str):
            return out
        for sent in self._SENT.split(text):
            hit = cache.get(sent)
            if hit is None:
                hit = cache[sent] = frozenset(self.extract(sent))
            out |= hit
        return out

    def run(self, df, text_cols=("title", "description"), tag_col="key_skills"):
        """Adds columns: skills (list), new_terms (list). Sentence-level cache: recruiter text repeats a lot."""
        skills, new_terms = [], []
        cache, scache = {}, {}
        for row in df[[*text_cols, tag_col]].itertuples(index=False):
            found = set()
            for c in row[:-1]:
                found |= self._extract_cached(c, scache)
            unknown = []
            tags = row[-1]
            if isinstance(tags, str) and tags:
                for tag in re.split(r"[,;|]", tags):
                    tag = tag.strip()
                    if not tag:
                        continue
                    if tag not in cache:
                        cache[tag] = self.normalise_tag(tag)
                    sk, clean = cache[tag]
                    if sk:
                        found.add(sk)
                    elif 2 < len(clean) < 40:
                        unknown.append(clean)
            skills.append(sorted(found))
            new_terms.append(unknown)
        out = df.copy()
        out["skills"] = skills
        out["new_terms"] = new_terms
        return out


def evaluate_synthetic(df):
    """Micro precision/recall/F1 of extracted skills vs generator ground truth."""
    tp = fp = fn = 0
    per_skill = defaultdict(lambda: [0, 0, 0])
    for pred, true in zip(df["skills"], df["skills_true"].str.split("|")):
        p, t = set(pred), set(true)
        tp += len(p & t); fp += len(p - t); fn += len(t - p)
        for s in p & t: per_skill[s][0] += 1
        for s in p - t: per_skill[s][1] += 1
        for s in t - p: per_skill[s][2] += 1
    prec, rec = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
    worst = sorted(((s, v[0] / max(v[0] + v[1], 1)) for s, v in per_skill.items() if v[0] + v[1] > 30), key=lambda x: x[1])[:5]
    return {"precision": round(prec, 3), "recall": round(rec, 3), "f1": round(2 * prec * rec / max(prec + rec, 1e-9), 3),
            "n_postings": int(len(df)), "lowest_precision_skills": [(s, round(v, 3)) for s, v in worst]}


def evaluate_against_reference(df_real, extractor):
    """Real postings ship with the author's own keyword labels; measure agreement on overlapping vocabulary."""
    agree = tot_ref = tot_ours = 0
    for ours, ref in zip(df_real["skills"], df_real["reference_skills"]):
        if not isinstance(ref, str):
            continue
        ref_terms = [x.strip(" '\"") for x in ref.strip("[]").split(",") if x.strip(" '\"")]
        ref_mapped = set()
        for t in ref_terms:
            ref_mapped |= extractor.extract(t)
        ours = set(ours) - {"Communication (English)", "Teamwork", "Problem Solving", "Leadership & People Management", "Project Management"}
        ref_mapped -= {"Communication (English)", "Teamwork", "Problem Solving", "Leadership & People Management", "Project Management"}
        agree += len(ours & ref_mapped); tot_ref += len(ref_mapped); tot_ours += len(ours)
    return {"recall_vs_reference": round(agree / max(tot_ref, 1), 3), "precision_vs_reference": round(agree / max(tot_ours, 1), 3),
            "n_postings": int(len(df_real))}


def train_skill2vec(skill_lists, dim=48, seed=42):
    from gensim.models import Word2Vec

    rng = np.random.default_rng(seed)
    sents = []
    for sl in skill_lists:
        if len(sl) >= 2:
            s = list(sl)
            rng.shuffle(s)
            sents.append(s)
    model = Word2Vec(sents, vector_size=dim, window=12, min_count=5, sg=1, negative=8, epochs=8, workers=2, seed=seed)
    return model


def skill_neighbours(model, cooc, k=8):
    out = {}
    for s in model.wv.index_to_key:
        sims = model.wv.most_similar(s, topn=k)
        out[s] = [{"skill": t, "sim": round(float(v), 3), "cooc": int(cooc.get(tuple(sorted((s, t))), 0))} for t, v in sims]
    return out


def cooccurrence(skill_lists):
    c = Counter()
    for sl in skill_lists:
        sl = sorted(set(sl))
        for i in range(len(sl)):
            for j in range(i + 1, len(sl)):
                c[(sl[i], sl[j])] += 1
    return c


def emerging_terms(df, min_total=40, recent=6, prior=12):
    """Unmatched recruiter tags with the steepest rise in share of postings."""
    month = df["date"].dt.to_period("M")
    last = month.max()
    rec_mask = month > last - recent
    pri_mask = (month <= last - recent) & (month > last - recent - prior)
    n_rec, n_pri = rec_mask.sum(), pri_mask.sum()
    cnt_rec, cnt_pri, total, first = Counter(), Counter(), Counter(), {}
    for terms, m, r, p in zip(df["new_terms"], month, rec_mask, pri_mask):
        for t in set(terms):
            total[t] += 1
            first[t] = min(first.get(t, m), m)
            if r: cnt_rec[t] += 1
            if p: cnt_pri[t] += 1
    rows = []
    for t, n in total.items():
        if n < min_total:
            continue
        sr = (cnt_rec[t] + 1) / n_rec
        sp = (cnt_pri[t] + 1) / n_pri
        rows.append({"term": t, "postings_total": n, "share_recent_pct": round(100 * sr, 3), "share_prior_pct": round(100 * sp, 3),
                     "growth_x": round(sr / sp, 2), "first_seen": str(first[t])})
    out = pd.DataFrame(rows)
    if out.empty:
        return out
    return out.sort_values(["growth_x", "postings_total"], ascending=False).reset_index(drop=True)
