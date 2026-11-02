import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Tip } from "./ui";

const INDIA = [[67.5, 6.2], [97.8, 37.4]];

function bbox(geom) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (c) => (typeof c[0] === "number" ? (x0 = Math.min(x0, c[0]), y0 = Math.min(y0, c[1]), x1 = Math.max(x1, c[0]), y1 = Math.max(y1, c[1])) : c.forEach(walk));
  walk(geom.coordinates);
  return [[x0, y0], [x1, y1]];
}

/**
 * Generic India map.
 *  stateColor(state) -> hex           choropleth for states
 *  districtColor(code, props) -> hex  choropleth for districts (shown when a state is selected or showDistricts)
 *  districtHeight(code) -> metres     3D extrusion (when extrude)
 *  points: [{lon,lat,color,r,...}]    circle markers (training centres)
 */
export default function MapView({ geoStates, geoDistricts, stateColor, districtColor, districtHeight, selected, onSelect,
  showDistricts = false, extrude = false, points, pointColor, tooltip, pointTooltip, height = "100%", interactive = true }) {
  const ref = useRef(null);
  const map = useRef(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState(null);
  const hoverId = useRef(null);
  const cb = useRef({});
  cb.current = { onSelect, tooltip, pointTooltip };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: ref.current,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "rgba(0,0,0,0)" } }] },
      bounds: INDIA, fitBoundsOptions: { padding: { top: 90, bottom: 30, left: 30, right: 30 } }, attributionControl: false, maxPitch: 60, dragRotate: true,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    map.current = m;
    m.on("load", () => {
      m.addSource("states", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "state" });
      m.addSource("districts", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "dt_code" });
      m.addSource("points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "st-fill", type: "fill", source: "states", paint: { "fill-color": ["get", "_c"], "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0.82] } });
      m.addLayer({ id: "dt-fill", type: "fill", source: "districts", paint: { "fill-color": ["get", "_c"], "fill-opacity": 0.9 }, layout: { visibility: "none" } });
      m.addLayer({ id: "dt-line", type: "line", source: "districts", paint: { "line-color": "#0a1022", "line-width": 0.5, "line-opacity": 0.9 }, layout: { visibility: "none" } });
      m.addLayer({ id: "dt-ext", type: "fill-extrusion", source: "districts", layout: { visibility: "none" },
        paint: { "fill-extrusion-color": ["get", "_c"], "fill-extrusion-height": ["get", "_h"], "fill-extrusion-opacity": 0.92, "fill-extrusion-vertical-gradient": true } });
      m.addLayer({ id: "st-glow", type: "line", source: "states", paint: { "line-color": "#22d3ee", "line-width": 5, "line-blur": 6, "line-opacity": 0.22 } });
      m.addLayer({ id: "st-line", type: "line", source: "states", paint: { "line-color": "#5aa7ff", "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.8, 0.7], "line-opacity": 0.75 } });
      m.addLayer({ id: "st-sel", type: "line", source: "states", filter: ["==", ["get", "state"], ""], paint: { "line-color": "#22d3ee", "line-width": 2.6 } });
      m.addLayer({ id: "st-sel-glow", type: "line", source: "states", filter: ["==", ["get", "state"], ""], paint: { "line-color": "#22d3ee", "line-width": 12, "line-blur": 10, "line-opacity": 0.45 } });
      m.addLayer({ id: "pts", type: "circle", source: "points", paint: {
        "circle-color": ["get", "_c"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, ["*", ["get", "_r"], 0.55], 6, ["get", "_r"], 9, ["*", ["get", "_r"], 2]],
        "circle-opacity": 0.85, "circle-stroke-color": "#060a16", "circle-stroke-width": 0.6 } });
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
      cb.current.onSelect?.(f ? f.properties.state : null);
    });
    return () => m.remove();
  }, []);

  // state choropleth
  useEffect(() => {
    if (!ready) return;
    const feats = geoStates.features.map((f) => ({ ...f, properties: { ...f.properties, _c: stateColor(f.properties.state) } }));
    map.current.getSource("states").setData({ type: "FeatureCollection", features: feats });
  }, [ready, geoStates, stateColor]);

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
    m.setPaintProperty("st-fill", "fill-opacity", extrude ? 0.35 : ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0.82]);
  }, [ready, geoDistricts, districtColor, districtHeight, selected, showDistricts, extrude]);

  useEffect(() => {
    if (!ready) return;
    map.current.easeTo({ pitch: extrude ? 50 : 0, bearing: extrude ? -12 : 0, duration: 900 });
  }, [ready, extrude]);

  // selection + zoom
  useEffect(() => {
    if (!ready) return;
    const m = map.current;
    m.setFilter("st-sel", ["==", ["get", "state"], selected || ""]);
    m.setFilter("st-sel-glow", ["==", ["get", "state"], selected || ""]);
    if (!interactive) return;
    if (selected) {
      const f = geoStates.features.find((x) => x.properties.state === selected);
      if (f) m.fitBounds(bbox(f.geometry), { padding: { top: 110, bottom: 50, left: 50, right: 50 }, duration: 900, pitch: extrude ? 50 : 0 });
    } else m.fitBounds(INDIA, { padding: { top: 90, bottom: 30, left: 30, right: 30 }, duration: 900, pitch: extrude ? 50 : 0 });
  }, [ready, selected, geoStates, interactive]);

  // points
  useEffect(() => {
    if (!ready) return;
    const feats = (points || []).map((p, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { i, _c: pointColor ? pointColor(p) : "#22d3ee", _r: p.r || 3, name: p.name, type: p.type, district: p.district, state: p.state, seats: p.seats, skills: (p.skills || []).join(", ") } }));
    map.current.getSource("points").setData({ type: "FeatureCollection", features: feats });
    if (!extrude) map.current.setPaintProperty("st-fill", "fill-opacity", feats.length ? 0.45 : ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0.82]);
    map.current.setPaintProperty("dt-fill", "fill-opacity", feats.length ? 0.5 : 0.9);
  }, [ready, points, pointColor, extrude]);

  return (
    <div className={height === "100%" ? "absolute inset-0" : "relative w-full"} style={height === "100%" ? undefined : { height }}>
      <div ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {tip && <Tip x={tip.x} y={tip.y}>{tip.content}</Tip>}
    </div>
  );
}
