"""Demand forecasting: monthly postings per skill (national) and per state x skill cluster.

Four models, compared with a 12-month rolling-origin holdout:
  - Seasonal naive (baseline: same month last year)
  - ETS / Holt-Winters (damped additive trend, additive seasonality) - one model per series
  - XGBoost global model - one model across all series on scale-free lag features, recursive multi-step
  - GRU global model (PyTorch) - 24-month window -> next 12 months directly (multi-output)
Metric: MASE (scaled by in-sample seasonal-naive error; <1 beats the baseline) and sMAPE.
The best model (or ensemble) on the holdout is refit on all data; prediction intervals come from
holdout errors per horizon.
"""
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
H = 12
WIN = 24


def build_series(postings, min_total=300):
    m = postings["date"].dt.to_period("M")
    months = pd.period_range(m.min(), m.max(), freq="M")
    ex = postings.assign(month=m)[["month", "state", "cluster", "skills"]]
    sk = ex.explode("skills").dropna(subset=["skills"])
    nat = sk.groupby(["skills", "month"]).size().unstack(fill_value=0).reindex(columns=months, fill_value=0)
    nat = nat[nat.sum(1) >= min_total]
    nat.index = ["skill::" + i for i in nat.index]
    big = ex.groupby("state").size()
    big = big[big >= 3000].index
    sc = ex[ex.state.isin(big) & (ex.cluster != "CS")].groupby(["state", "cluster", "month"]).size().unstack(fill_value=0)
    sc = sc.reindex(columns=months, fill_value=0)
    sc = sc[sc.sum(1) >= 150]
    sc.index = [f"sc::{s}::{c}" for s, c in sc.index]
    return pd.concat([nat, sc]).astype(float), months


def _mase_scale(y):
    d = np.abs(y[12:] - y[:-12])
    return max(d.mean(), 1e-6)


def snaive(y, h=H):
    return np.array([y[len(y) - 12 + (i % 12)] for i in range(h)])


def ets(y, h=H):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    try:
        m = ExponentialSmoothing(y + 1.0, trend="add", damped_trend=True, seasonal="add", seasonal_periods=12,
                                 initialization_method="estimated").fit(optimized=True)
        return np.maximum(m.forecast(h) - 1.0, 0)
    except Exception:
        return snaive(y, h)


# ---------------------------------------------------------------- XGBoost global
LAGS = [1, 2, 3, 6, 12]


def _feats(hist, month_idx, kind_id):
    """hist: normalised history (1d). Returns feature vector for predicting the next value."""
    y = hist
    f = [y[-l] for l in LAGS]
    f += [y[-3:].mean(), y[-6:].mean(), y[-12:].mean(), y[-12:].mean() - y[-24:-12].mean(), y[-12:].std()]
    mo = month_idx % 12
    f += [np.sin(2 * np.pi * mo / 12), np.cos(2 * np.pi * mo / 12), kind_id]
    return f


def xgb_fit(Y, start_month, train_end):
    import xgboost as xgb
    X, t = [], []
    for i, y in enumerate(Y):
        sc = y[:train_end].mean() + 1e-6
        z = y / sc
        kind = 0 if i < Y.kind_split else 1
        for k in range(24, train_end):
            X.append(_feats(z[:k], start_month + k, kind)); t.append(z[k])
    m = xgb.XGBRegressor(n_estimators=400, max_depth=5, learning_rate=0.04, subsample=0.8, colsample_bytree=0.9,
                         min_child_weight=5, objective="reg:squarederror", n_jobs=2, random_state=0)
    m.fit(np.array(X), np.array(t))
    return m


def xgb_forecast(m, Y, start_month, train_end, h=H):
    out = []
    for i, y in enumerate(Y):
        sc = y[:train_end].mean() + 1e-6
        z = list(y[:train_end] / sc)
        kind = 0 if i < Y.kind_split else 1
        preds = []
        for j in range(h):
            p = float(m.predict(np.array([_feats(np.array(z), start_month + train_end + j, kind)]))[0])
            p = max(p, 0)
            preds.append(p); z.append(p)
        out.append(np.array(preds) * sc)
    return np.array(out)


# ---------------------------------------------------------------- GRU global
def gru_fit_forecast(Y, start_month, train_end, h=H, epochs=60, seed=0):
    import torch
    import torch.nn as nn
    torch.manual_seed(seed); np.random.seed(seed)

    def mfeat(k):
        mo = (start_month + k) % 12
        return [np.sin(2 * np.pi * mo / 12), np.cos(2 * np.pi * mo / 12)]

    X, T = [], []
    scales = []
    for y in Y:
        sc = y[:train_end].mean() + 1e-6
        scales.append(sc)
        z = y / sc
        for k in range(WIN, train_end - h + 1):
            X.append([[z[k - WIN + i]] + mfeat(k - WIN + i) for i in range(WIN)]); T.append(z[k:k + h])
    X = torch.tensor(np.array(X), dtype=torch.float32); T = torch.tensor(np.array(T), dtype=torch.float32)

    class Net(nn.Module):
        def __init__(self):
            super().__init__()
            self.gru = nn.GRU(3, 48, batch_first=True, num_layers=1)
            self.head = nn.Sequential(nn.Linear(48 + 1, 64), nn.ReLU(), nn.Linear(64, h))

        def forward(self, x):
            o, hN = self.gru(x)
            last = x[:, -12:, 0].mean(1, keepdim=True)
            return self.head(torch.cat([hN[-1], last], 1)) + last   # residual on recent level

    net = Net()
    opt = torch.optim.Adam(net.parameters(), lr=3e-3, weight_decay=1e-5)
    lossf = nn.HuberLoss(delta=0.5)
    n = len(X)
    for ep in range(epochs):
        perm = torch.randperm(n)
        for b in range(0, n, 256):
            idx = perm[b:b + 256]
            opt.zero_grad()
            loss = lossf(net(X[idx]), T[idx])
            loss.backward(); opt.step()
    net.eval()
    out = []
    with torch.no_grad():
        for y, sc in zip(Y, scales):
            z = y[:train_end] / sc
            k = train_end
            x = torch.tensor([[[z[k - WIN + i]] + mfeat(k - WIN + i) for i in range(WIN)]], dtype=torch.float32)
            out.append(np.maximum(net(x).numpy()[0], 0) * sc)
    return np.array(out)


class SeriesSet(np.ndarray):
    pass


def _as_set(df):
    nat = [i for i in df.index if i.startswith("skill::")]
    sc = [i for i in df.index if i.startswith("sc::")]
    arr = df.loc[nat + sc].values.view(SeriesSet)
    arr.kind_split = len(nat)
    return arr, nat + sc


def backtest(series, months, log=print):
    Y, names = _as_set(series)
    T = Y.shape[1]
    te = T - H
    start_month = months[0].month - 1
    actual = Y[:, te:]
    preds = {}
    log("  seasonal naive / ETS ...")
    preds["Seasonal naive"] = np.array([snaive(y[:te]) for y in Y])
    preds["ETS (Holt-Winters)"] = np.array([ets(y[:te]) for y in Y])
    log("  XGBoost global ...")
    m = xgb_fit(Y, start_month, te)
    preds["XGBoost (global)"] = xgb_forecast(m, Y, start_month, te)
    log("  GRU global ...")
    preds["GRU (global, PyTorch)"] = gru_fit_forecast(Y, start_month, te)
    preds["Ensemble (XGB + GRU + ETS)"] = (preds["XGBoost (global)"] + preds["GRU (global, PyTorch)"] + preds["ETS (Holt-Winters)"]) / 3
    rows = []
    scale = np.array([_mase_scale(y[:te]) for y in Y])
    for k, P in preds.items():
        mase = (np.abs(P - actual).mean(1) / scale)
        smape = (200 * np.abs(P - actual) / (np.abs(P) + np.abs(actual) + 1e-6)).mean(1)
        rows.append({"model": k, "MASE_all": round(float(np.median(mase)), 3),
                     "MASE_skill_series": round(float(np.median(mase[:Y.kind_split])), 3),
                     "MASE_state_cluster_series": round(float(np.median(mase[Y.kind_split:])), 3),
                     "sMAPE_pct": round(float(np.median(smape)), 1)})
    res = pd.DataFrame(rows).sort_values("MASE_all").reset_index(drop=True)
    return res, preds, actual, names


def final_forecast(series, months, model_name, holdout_preds, holdout_actual):
    Y, names = _as_set(series)
    T = Y.shape[1]
    start_month = months[0].month - 1
    if "Ensemble" in model_name or "XGBoost" in model_name:
        m = xgb_fit(Y, start_month, T)
        xg = xgb_forecast(m, Y, start_month, T)
    if "Ensemble" in model_name or "GRU" in model_name:
        gr = gru_fit_forecast(Y, start_month, T)
    if "Ensemble" in model_name or "ETS" in model_name:
        et = np.array([ets(y) for y in Y])
    if model_name.startswith("Ensemble"):
        P = (xg + gr + et) / 3
    elif "XGBoost" in model_name:
        P = xg
    elif "GRU" in model_name:
        P = gr
    elif "ETS" in model_name:
        P = et
    else:
        P = np.array([snaive(y) for y in Y])
    # 80% interval from holdout log-ratio errors per horizon
    hp = holdout_preds[model_name]
    ratio = np.log((holdout_actual + 1) / (hp + 1))
    lo_q, hi_q = np.quantile(ratio, 0.1, axis=0), np.quantile(ratio, 0.9, axis=0)
    lo = np.maximum((P + 1) * np.exp(lo_q) - 1, 0)
    hi = (P + 1) * np.exp(hi_q) - 1
    fut = pd.period_range(months[-1] + 1, periods=H, freq="M")
    return names, P, lo, hi, fut
