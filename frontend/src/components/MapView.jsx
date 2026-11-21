import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, Plus, Minus } from "lucide-react";
import { Tip } from "./ui";
import { C } from "../theme";

const INDIA = [[67.5, 6.2], [97.8, 37.4]];
// The map can't be dragged further than this box, so India never disappears off-screen.
const LIMITS = [[52, -4], [113, 45]];
const PAD = { top: 70, bottom: 30, left: 30, right: 30 };

function bbox(geom) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (c) => (typeof c[0] === "number" ? (x0 = Math.min(x0, c[0]), y0 = Math.min(y0, c[1]), x1 = Math.max(x1, c[0]), y1 = Math.max(y1, c[1])) : c.forEach(walk));
  walk(geom.coordinates);
  return [[x0, y0], [x1, y1]];
}

// share of the screen covered by the target area (India, or the selected state). Near 0 = the user has lost it.
function targetShare(m, box) {
  const b = m.getBounds();
  const ix = Math.max(0, Math.min(b.getEast(), box[1][0]) - Math.max(b.getWest(), box[0][0]));
  const iy = Math.max(0, Math.min(b.getNorth(), box[1][1]) - Math.max(b.getSouth(), box[0][1]));
  const viewArea = (b.getEast() - b.getWest()) * (b.getNorth() - b.getSouth());
  return (ix * iy) / Math.max(viewArea, 1e-9);
}

/**
 * India map.
 *  stateColor(state) -> colour        state fill
 *  districtColor(code, props)         district fill (shown when a state is selected or showDistricts)
 *  districtHeight(code) -> metres     3D towers (when extrude)
 *  points: [{lon,lat,r,...}]          circle markers (training centres)
 *  mode: "light" | "dark"             re-applies colours when the theme changes
 */
export default function MapView({ geoStates, geoDistricts, stateColor, districtColor, districtHeight, selected, onSelect,
  showDistricts = false, extrude = false, points, pointColor, tooltip, pointTooltip, height = "100%", interactive = true, mode = "light", label = "Map of India", padTop = 70 }) {
  const PADS = { ...PAD, top: padTop };
  const wrap = useRef(null);
  const ref = useRef(null);
  const map = useRef(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState(null);
  const [lost, setLost] = useState(false);
  const hoverId = useRef(null);
  const cb = useRef({});
  cb.current = { onSelect, tooltip, pointTooltip };
  const view = useRef({ selected, extrude });
  view.current = { selected, extrude };

  // fit the map to the selected state, or to all of India
  const recentre = (duration = 700) => {
    const m = map.current; if (!m) return;
    const { selected: sel, extrude: ex } = view.current;
    const f = sel && geoStates.features.find((x) => x.properties.state === sel);
    m.fitBounds(f ? bbox(f.geometry) : INDIA, { padding: f ? { top: padTop + 20, bottom: 50, left: 50, right: 50 } : PADS, duration, pitch: ex ? 50 : 0, bearing: ex ? -12 : 0 });
  };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: ref.current,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "rgba(0,0,0,0)" } }] },
      bounds: INDIA, fitBoundsOptions: { padding: PADS }, attributionControl: false,
      maxBounds: LIMITS, minZoom: 2.6, maxZoom: 9.5, maxPitch: 60,
      dragRotate: false, pitchWithRotate: false, touchPitch: false,   // no accidental spinning or tilting
    });
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation?.();
    map.current = m;
    m.on("load", () => {
      m.addSource("states", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "state" });
      m.addSource("districts", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "dt_code" });
      m.addSource("points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "st-fill", type: "fill", source: "states", paint: { "fill-color": ["get", "_c"], "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.92] } });
      m.addLayer({ id: "dt-fill", type: "fill", source: "districts", paint: { "fill-color": ["get", "_c"], "fill-opacity": 0.92 }, layout: { visibility: "none" } });
      m.addLayer({ id: "dt-line", type: "line", source: "districts", paint: { "line-color": C.distLine, "line-width": 0.5, "line-opacity": 0.9 }, layout: { visibility: "none" } });
      m.addLayer({ id: "dt-ext", type: "fill-extrusion", source: "districts", layout: { visibility: "none" },
        paint: { "fill-extrusion-color": ["get", "_c"], "fill-extrusion-height": ["get", "_h"], "fill-extrusion-opacity": 0.92, "fill-extrusion-vertical-gradient": true } });
      m.addLayer({ id: "st-line", type: "line", source: "states", paint: { "line-color": C.stateLine, "line-width": 0.9, "line-opacity": 1 } });
      m.addLayer({ id: "st-hover", type: "line", source: "states", paint: { "line-color": C.stateHover, "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.2, 0], "line-opacity": 0.9 } });
      m.addLayer({ id: "st-sel", type: "line", source: "states", filter: ["==", ["get", "state"], ""], paint: { "line-color": C.sel, "line-width": 3 } });
      m.addLayer({ id: "pts", type: "circle", source: "points", paint: {
        "circle-color": ["get", "_c"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, ["*", ["get", "_r"], 0.55], 6, ["get", "_r"], 9, ["*", ["get", "_r"], 2]],
        "circle-opacity": 0.9, "circle-stroke-color": C.ptStroke, "circle-stroke-width": 0.6 } });
      setReady(true);
    });
    const move = (e) => {
      const f = m.queryRenderedFeatures(e.point, { layers: ["pts", "dt-ext", "dt-fill", "st-fill"].filter((l) => m.getLayer(l) && m.getLayoutProperty(l, "visibility") !== "none") })[0];
      if (hoverId.current != null) m.setFeatureState({ source: "states", id: hoverId.current }, { hover: false });
      hoverId.current = null;
      if (!f) { setTip(null); m.getCanvas().style.cursor = ""; return; }
      m.getCanvas().style.cursor = "pointer";
      if (f.layer.id === "st-fill") { hoverId.current = f.properties.state; m.setFeatureState({ source: "states", id: f.properties.state }, { hover: true }); }
      const content = f.layer.id === "pts" ? cb.current.pointTooltip?.(f.properties) : cb.current.tooltip?.(f.layer.id.startsWith("dt") ? "district" : "state", f.properties);
      setTip(content ? { x: e.point.x, y: e.point.y, content } : null);
    };
    m.on("mousemove", move);
    m.on("mouseout", () => setTip(null));
    m.on("click", (e) => {
      const f = m.queryRenderedFeatures(e.point, { layers: ["st-fill"] })[0];
      if (f) cb.current.onSelect?.(f.properties.state);   // clicking the sea no longer resets the view
    });
    // if India has mostly left the screen (dragged away or zoomed far out), offer to bring it back
    m.on("moveend", () => {
      const sel = view.current.selected && geoStates.features.find((x) => x.properties.state === view.current.selected);
      const box = sel ? bbox(sel.geometry) : INDIA;
      setLost(targetShare(m, box) < (sel ? 0.03 : 0.12));
    });
    // the map must redraw whenever its box changes size (sidebar, window, panels), otherwise it renders off-centre
    const ro = new ResizeObserver(() => { m.resize(); });
    ro.observe(wrap.current);
    return () => { ro.disconnect(); m.remove(); };
  }, []);

  // theme colours for lines and markers
  useEffect(() => {
    if (!ready) return;
    const m = map.current;
    m.setPaintProperty("st-line", "line-color", C.stateLine);
    m.setPaintProperty("st-hover", "line-color", C.stateHover);
    m.setPaintProperty("st-sel", "line-color", C.sel);
    m.setPaintProperty("dt-line", "line-color", C.distLine);
    m.setPaintProperty("pts", "circle-stroke-color", C.ptStroke);
  }, [ready, mode]);

  // state fills
  useEffect(() => {
    if (!ready) return;
    const feats = geoStates.features.map((f) => ({ ...f, properties: { ...f.properties, _c: stateColor(f.properties.state) } }));
    map.current.getSource("states").setData({ type: "FeatureCollection", features: feats });
  }, [ready, geoStates, stateColor, mode]);

  // districts
  useEffect(() => {
    if (!ready) return;
    const m = map.current;
    const visible = showDistricts || !!selected;
    const feats = !visible || !districtColor ? [] : geoDistricts.features
      .filter((f) => showDistricts || f.properties.state === selected)
      .map((f) => ({ ...f, properties: { ...f.properties, _c: districtColor(f.properties.dt_code, f.properties), _h: districtHeight ? districtHeight(f.properties.dt_code) : 0 } }));
    m.getSource("districts").setData({ type: "FeatureCollection", features: feats });
    m.setLayoutProperty("dt-fill", "visibility", visible && !extrude ? "visible" : "none");
    m.setLayoutProperty("dt-line", "visibility", visible && !extrude ? "visible" : "none");
    m.setLayoutProperty("dt-ext", "visibility", visible && extrude ? "visible" : "none");
    m.setPaintProperty("st-fill", "fill-opacity", extrude ? 0.35 : ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.92]);
  }, [ready, geoDistricts, districtColor, districtHeight, selected, showDistricts, extrude, mode]);

  useEffect(() => {
    if (!ready) return;
    map.current.easeTo({ pitch: extrude ? 50 : 0, bearing: extrude ? -12 : 0, duration: 900 });
  }, [ready, extrude]);

  // selection + zoom
  useEffect(() => {
    if (!ready) return;
    map.current.setFilter("st-sel", ["==", ["get", "state"], selected || ""]);
    if (interactive) recentre(900);
  }, [ready, selected, geoStates, interactive]);

  // points
  useEffect(() => {
    if (!ready) return;
    const feats = (points || []).map((p, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { i, _c: pointColor ? pointColor(p) : C.highlight, _r: p.r || 3, name: p.name, type: p.type, district: p.district, state: p.state, seats: p.seats, skills: (p.skills || []).join(", ") } }));
    map.current.getSource("points").setData({ type: "FeatureCollection", features: feats });
    if (!extrude) map.current.setPaintProperty("st-fill", "fill-opacity", feats.length ? 0.5 : ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.92]);
    map.current.setPaintProperty("dt-fill", "fill-opacity", feats.length ? 0.5 : 0.92);
  }, [ready, points, pointColor, extrude, mode]);

  const btn = "w-9 h-9 grid place-items-center hover:bg-panel2 text-ink";
  return (
    <div ref={wrap} className={height === "100%" ? "absolute inset-0" : "relative w-full"} style={height === "100%" ? undefined : { height }}>
      <div ref={ref} role="region" aria-label={label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {tip && <Tip x={tip.x} y={tip.y}>{tip.content}</Tip>}

      {/* map controls: zoom and recentre, always reachable by mouse, touch and keyboard */}
      <div className="absolute right-3 bottom-3 flex flex-col gap-2 no-print">
        <div className="glass !rounded-lg overflow-hidden flex flex-col divide-y divide-[var(--c-line)]">
          <button className={btn} onClick={() => map.current?.zoomIn()} aria-label="Zoom in" title="Zoom in"><Plus size={18} /></button>
          <button className={btn} onClick={() => map.current?.zoomOut()} aria-label="Zoom out" title="Zoom out"><Minus size={18} /></button>
        </div>
        <button className={`glass !rounded-lg ${btn}`} onClick={() => recentre()} aria-label={selected ? `Recentre on ${selected}` : "Recentre on India"} title="Recentre">
          <LocateFixed size={18} />
        </button>
      </div>
      {lost && (
        <button onClick={() => recentre()} className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-30 rounded-full bg-accent text-onaccent px-4 py-2.5 text-[14px] font-semibold shadow-lg flex items-center gap-2 pulse no-print">
          <LocateFixed size={18} />Back to {selected || "India"}
        </button>
      )}
    </div>
  );
}
