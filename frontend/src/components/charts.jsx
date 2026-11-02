import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LineChart, Legend } from "recharts";
import { fmt, INK } from "../theme";

export function ChartTip({ active, payload, label, unit = "", hide = [] }) {
  if (!active || !payload?.length) return null;
  const seen = new Set();
  return (
    <div className="glass px-3 py-2 text-[12px] min-w-[160px]">
      <div className="text-muted mb-1">{label}</div>
      {payload.filter((p) => p.value != null && !hide.includes(p.dataKey) && !seen.has(p.name) && seen.add(p.name)).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 justify-between">
          <span className="flex items-center gap-1.5 text-ink2"><span className="inline-block w-3 h-[2px]" style={{ background: p.color || p.stroke }} />{p.name}</span>
          <b className="num text-ink">{Array.isArray(p.value) ? `${fmt.int(p.value[0])} – ${fmt.int(p.value[1])}` : fmt.int(p.value)}{unit}</b>
        </div>
      ))}
    </div>
  );
}

const axis = { stroke: INK.axis, tickLine: false, tick: { fill: INK.muted, fontSize: 11 } };

/** history + forecast + 80% band; one y-axis */
export function ForecastChart({ hist, fut, histMonths, futMonths, height = 280, color = "#3987e5", fcColor = "#22d3ee" }) {
  const rows = [
    ...hist.map((v, i) => ({ m: histMonths[i], actual: v })),
    ...fut.f.map((v, i) => ({ m: futMonths[i], forecast: v, band: [fut.lo[i], fut.hi[i]] })),
  ];
  rows[hist.length - 1].forecast = hist.at(-1);
  rows[hist.length - 1].band = [hist.at(-1), hist.at(-1)];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="m" {...axis} interval={5} />
        <YAxis {...axis} width={48} tickFormatter={fmt.compact} />
        <Tooltip content={<ChartTip />} cursor={{ stroke: "#3b4a70", strokeDasharray: "3 3" }} />
        <ReferenceLine x={histMonths.at(-1)} stroke="#3b4a70" strokeDasharray="4 4" label={{ value: "today", fill: INK.muted, fontSize: 10, position: "insideTopRight" }} />
        <Area dataKey="band" name="80% interval" stroke="none" fill={fcColor} fillOpacity={0.14} isAnimationActive={false} />
        <Line dataKey="actual" name="Postings (actual)" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="forecast" name="Forecast" stroke={fcColor} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 11.5, color: INK.secondary }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function MultiLine({ rows, xKey, series, height = 240, yFmt = fmt.compact, refX }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={48} tickFormatter={yFmt} />
        <Tooltip content={<ChartTip />} cursor={{ stroke: "#3b4a70", strokeDasharray: "3 3" }} />
        {refX && <ReferenceLine x={refX} stroke="#3b4a70" strokeDasharray="4 4" />}
        {series.map((s) => <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={s.width || 2} strokeDasharray={s.dash} dot={false} isAnimationActive={false} />)}
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 11.5, color: INK.secondary }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
