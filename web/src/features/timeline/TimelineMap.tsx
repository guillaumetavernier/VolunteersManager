import { useEffect, useMemo, useRef } from "react";
import maplibregl, { Map as MLMap, GeoJSONSource, LngLatBounds } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";

import "maplibre-gl/dist/maplibre-gl.css";

import { buildMapStyle, type TileSource } from "@/features/map/style";

import { useTimelineCursor } from "./useTimelineCursor";
import { useTimelineSelection } from "./useTimelineSelection";
import {
  runnerFrontPosition,
  runnerTailPosition,
  volunteerPosition,
  carPosition,
  type LonLat,
} from "./positions";
import type { TimelineData } from "./useTimelineData";

interface Props {
  source: TileSource;
  data: TimelineData;
}

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

interface ReusableFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

interface ReusableCollection {
  type: "FeatureCollection";
  features: ReusableFeature[];
}

export function TimelineMap({ source, data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const styleReadyRef = useRef(false);

  const style = useMemo(() => buildMapStyle(source), [source]);

  useEffect(() => {
    if (source.kind !== "pmtiles" || !source.region) return;
    const archive = new PMTiles(`/tiles/${source.region}.pmtiles`);
    pmtilesProtocol.add(archive);
  }, [source]);

  useEffect(() => {
    if (!containerRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [2.349014, 48.864716],
      zoom: 5,
    });
    mapRef.current = m;
    (window as unknown as { __timelineMap?: MLMap }).__timelineMap = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    const onReady = () => {
      if (m.isStyleLoaded()) styleReadyRef.current = true;
    };
    m.on("styledata", onReady);
    m.on("load", () => {
      styleReadyRef.current = true;
    });
    onReady();
    return () => {
      m.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
    };
  }, [style]);

  // Add race polylines (static lines) + dimming based on selection.
  const selected = useTimelineSelection((s) => s.selected);
  const visibleRaces = useTimelineSelection((s) => s.visibleRaces);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let done = false;
    const tryAdd = (): boolean => {
      try {
        for (const r of data.races) {
          const sid = `tl-race-${r.id}`;
          const lid = `tl-race-line-${r.id}`;
          const tl = data.raceTimelines.get(r.id);
          if (!tl || tl.points.length === 0) continue;
          const coords: number[][] = [];
          for (let i = 0; i < tl.points.length; i += 3) {
            coords.push([tl.points[i], tl.points[i + 1]]);
          }
          if (!map.getSource(sid)) {
            map.addSource(sid, {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: coords },
              },
            });
          } else {
            (map.getSource(sid) as GeoJSONSource).setData({
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: coords },
            });
          }
          if (!map.getLayer(lid)) {
            map.addLayer({
              id: lid,
              type: "line",
              source: sid,
              paint: { "line-color": r.color, "line-width": 3 },
            });
          }
          const visible = visibleRaces[r.id] ?? true;
          const dim = selected != null && selected.raceID !== r.id;
          map.setLayoutProperty(lid, "visibility", visible ? "visible" : "none");
          map.setPaintProperty(lid, "line-opacity", dim ? 0.15 : 1);
        }
        return true;
      } catch {
        return false;
      }
    };
    if (tryAdd()) {
      done = true;
    } else {
      const onStyleData = () => {
        if (done) return;
        if (tryAdd()) {
          done = true;
          map.off("styledata", onStyleData);
        }
      };
      map.on("styledata", onStyleData);
      return () => {
        map.off("styledata", onStyleData);
      };
    }
  }, [data.races, data.raceTimelines, selected, visibleRaces]);

  // Zoom to sub-race segment.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    const tl = data.raceTimelines.get(selected.raceID);
    if (!tl) return;
    // Find dist range for from→to VS via projected_dist_m in race-VS entries.
    const fromTiming = tl.frontTimings.find((t) => t.vs_id === selected.fromVsID);
    const toTiming = tl.frontTimings.find((t) => t.vs_id === selected.toVsID);
    if (!fromTiming || !toTiming) return;
    const dMin = Math.min(fromTiming.projected_dist_m, toTiming.projected_dist_m);
    const dMax = Math.max(fromTiming.projected_dist_m, toTiming.projected_dist_m);
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (let i = 0; i < tl.points.length; i += 3) {
      const d = tl.points[i + 2];
      if (d < dMin || d > dMax) continue;
      const lon = tl.points[i];
      const lat = tl.points[i + 1];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    if (Number.isFinite(minLon)) {
      const bounds = new LngLatBounds([minLon, minLat], [maxLon, maxLat]);
      map.fitBounds(bounds, { padding: 60, animate: true, duration: 600 });
    }
  }, [selected, data.raceTimelines]);

  // Per-frame dynamic markers (runners, volunteers, cars).
  const cursorMs = useTimelineCursor((s) => s.cursorTime);

  // Reuse FeatureCollections + features to avoid per-frame allocations.
  const volsRef = useRef<ReusableCollection>({ type: "FeatureCollection", features: [] });
  const carsRef = useRef<ReusableCollection>({ type: "FeatureCollection", features: [] });
  const frontRefByRace = useRef<Map<number, { fc: ReusableCollection; feat: ReusableFeature }>>(new Map());
  const tailRefByRace = useRef<Map<number, { fc: ReusableCollection; feat: ReusableFeature }>>(new Map());
  const outRef = useRef<LonLat>({ lon: 0, lat: 0 });

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let raf = 0;
    const ensureSources = (): boolean => {
      try {
        for (const r of data.races) {
          const front = `tl-race-front-${r.id}`;
          const tail = `tl-race-tail-${r.id}`;
          if (!map.getSource(front)) {
            map.addSource(front, {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
            map.addLayer({
              id: front,
              type: "circle",
              source: front,
              paint: {
                "circle-radius": 6,
                "circle-color": r.color,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
              },
            });
          }
          if (!map.getSource(tail)) {
            map.addSource(tail, {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
            map.addLayer({
              id: tail,
              type: "circle",
              source: tail,
              paint: {
                "circle-radius": 5,
                "circle-color": r.color,
                "circle-opacity": 0.5,
                "circle-stroke-width": 1,
                "circle-stroke-color": "#ffffff",
              },
            });
          }
        }
        if (!map.getSource("tl-volunteers")) {
          map.addSource("tl-volunteers", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "tl-volunteers",
            type: "circle",
            source: "tl-volunteers",
            paint: {
              "circle-radius": 4,
              "circle-color": "#0ea5e9",
              "circle-stroke-width": 1,
              "circle-stroke-color": "#ffffff",
            },
          });
        }
        if (!map.getSource("tl-cars")) {
          map.addSource("tl-cars", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "tl-cars",
            type: "circle",
            source: "tl-cars",
            paint: {
              "circle-radius": 6,
              "circle-color": "#1e293b",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fde047",
            },
          });
        }
        return true;
      } catch {
        return false;
      }
    };

    const updateOnce = () => {
      if (!ensureSources()) return;
      const out = outRef.current;
      // Runners.
      for (const r of data.races) {
        const tl = data.raceTimelines.get(r.id);
        if (!tl) continue;
        const frontSrc = map.getSource(`tl-race-front-${r.id}`) as GeoJSONSource | undefined;
        const tailSrc = map.getSource(`tl-race-tail-${r.id}`) as GeoJSONSource | undefined;
        const on = (visibleRaces[r.id] ?? true) && (!selected || selected.raceID === r.id);
        if (frontSrc) {
          let entry = frontRefByRace.current.get(r.id);
          if (!entry) {
            const feat = pointFeature(0, 0, { race_id: r.id, kind: "front" });
            entry = { fc: { type: "FeatureCollection", features: [] }, feat };
            frontRefByRace.current.set(r.id, entry);
          }
          if (on && runnerFrontPosition(tl, cursorMs, out)) {
            entry.feat.geometry.coordinates[0] = out.lon;
            entry.feat.geometry.coordinates[1] = out.lat;
            if (entry.fc.features.length === 0) entry.fc.features.push(entry.feat);
          } else {
            if (entry.fc.features.length !== 0) entry.fc.features.length = 0;
          }
          frontSrc.setData(entry.fc);
        }
        if (tailSrc) {
          let entry = tailRefByRace.current.get(r.id);
          if (!entry) {
            const feat = pointFeature(0, 0, { race_id: r.id, kind: "tail" });
            entry = { fc: { type: "FeatureCollection", features: [] }, feat };
            tailRefByRace.current.set(r.id, entry);
          }
          if (on && runnerTailPosition(tl, cursorMs, out)) {
            entry.feat.geometry.coordinates[0] = out.lon;
            entry.feat.geometry.coordinates[1] = out.lat;
            if (entry.fc.features.length === 0) entry.fc.features.push(entry.feat);
          } else {
            if (entry.fc.features.length !== 0) entry.fc.features.length = 0;
          }
          tailSrc.setData(entry.fc);
        }
      }
      // Volunteers.
      const vols = volsRef.current;
      const volFeatures = vols.features;
      let vCount = 0;
      for (const v of data.volunteers) {
        if (v.archived) continue;
        if (!volunteerPosition(v.id, cursorMs, data.context, out)) continue;
        if (vCount < volFeatures.length) {
          const f = volFeatures[vCount];
          f.geometry.coordinates[0] = out.lon;
          f.geometry.coordinates[1] = out.lat;
          (f.properties as { id: number }).id = v.id;
        } else {
          volFeatures.push(pointFeature(out.lon, out.lat, { id: v.id }));
        }
        vCount++;
      }
      volFeatures.length = vCount;
      const volSrc = map.getSource("tl-volunteers") as GeoJSONSource | undefined;
      if (volSrc) volSrc.setData(vols);
      // Cars.
      const cars = carsRef.current;
      const carFeatures = cars.features;
      let cCount = 0;
      for (const car of data.cars) {
        if (!carPosition(car.id, cursorMs, data.context, out)) continue;
        if (cCount < carFeatures.length) {
          const f = carFeatures[cCount];
          f.geometry.coordinates[0] = out.lon;
          f.geometry.coordinates[1] = out.lat;
          (f.properties as { id: number }).id = car.id;
        } else {
          carFeatures.push(pointFeature(out.lon, out.lat, { id: car.id }));
        }
        cCount++;
      }
      carFeatures.length = cCount;
      const carSrc = map.getSource("tl-cars") as GeoJSONSource | undefined;
      if (carSrc) carSrc.setData(cars);
    };

    const loop = () => {
      updateOnce();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data, cursorMs, selected, visibleRaces]);

  // Fit map to all VS bounds once.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (data.vsById.size === 0) return;
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const vs of data.vsById.values()) {
      if (vs.lon < minLon) minLon = vs.lon;
      if (vs.lon > maxLon) maxLon = vs.lon;
      if (vs.lat < minLat) minLat = vs.lat;
      if (vs.lat > maxLat) maxLat = vs.lat;
    }
    if (Number.isFinite(minLon)) {
      const bounds = new LngLatBounds([minLon, minLat], [maxLon, maxLat]);
      map.fitBounds(bounds, { padding: 60, animate: false });
    }
  }, [data.vsById]);

  return <div ref={containerRef} className="relative h-full w-full" data-testid="timeline-map" />;
}

function pointFeature(
  lon: number,
  lat: number,
  props: Record<string, unknown>,
): ReusableFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: { ...props },
  };
}
