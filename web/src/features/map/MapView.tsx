import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";

import "maplibre-gl/dist/maplibre-gl.css";

import { useVSList } from "@/features/vs/hooks";
import { usePatchVS } from "@/features/vs/hooks";
import type { VS } from "@/features/vs/api";
import { useRaces, useRaceTrack } from "@/features/race/hooks";
import { RacePolyline } from "@/features/race/RacePolylines";

import {
  FALLBACK_CENTER,
  computeInitialCamera,
  loadPersistedCamera,
  savePersistedCamera,
  type RaceTrack,
} from "./camera";
import { buildMapStyle, type TileSource } from "./style";

interface Props {
  source: TileSource;
  onClickEmpty?: (loc: { lat: number; lon: number }) => void;
  onClickVS?: (vs: VS) => void;
  selectedVSID?: number | null;
  selectedRaceID?: number | null;
  raceVisibility: Record<number, boolean>;
}

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

export function MapView({
  source,
  onClickEmpty,
  onClickVS,
  selectedVSID,
  selectedRaceID,
  raceVisibility,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Map<number, Marker>>(new Map());
  const [mapInstance, setMapInstance] = useState<MLMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [tilesMissing, setTilesMissing] = useState(false);
  // Initial-camera bookkeeping. The two refs together let the auto-fit effect
  // run at most once, and only if the user hasn't already started panning
  // during the data-loading window.
  const hasFittedRef = useRef(false);
  const hasUserMovedRef = useRef(false);

  const vsQuery = useVSList();
  const patch = usePatchVS();
  const races = useRaces();
  const raceTrack = useRaceTrack(selectedRaceID ?? 0);

  // Latest callbacks via a ref so the map's `click` handler always sees the
  // current closure without forcing a teardown.
  const cbRef = useRef({ onClickEmpty, onClickVS });
  cbRef.current = { onClickEmpty, onClickVS };

  // Register the pmtiles archive so MapLibre can read its directory in one
  // round-trip. Online mode hits api.protomaps.com directly via the style's
  // tiles[] URL template — no protocol registration needed.
  useEffect(() => {
    if (source.kind !== "pmtiles" || !source.region) return;
    const archive = new PMTiles(`/tiles/${source.region}.pmtiles`);
    pmtilesProtocol.add(archive);
    return () => {
      // pmtiles has no removeArchive; leaving it cached is fine on unmount.
    };
  }, [source]);

  const style = useMemo(() => buildMapStyle(source), [source]);

  // Boot MapLibre once.
  useEffect(() => {
    if (!containerRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [FALLBACK_CENTER.lng, FALLBACK_CENTER.lat],
      zoom: FALLBACK_CENTER.zoom,
    });
    mapRef.current = m;
    setMapInstance(m);
    (window as unknown as { __map?: MLMap }).__map = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");

    // `originalEvent` is populated for DOM-originated moves (drag, wheel,
    // pinch) and undefined for programmatic ones (jumpTo, fitBounds). This
    // distinction lets us (1) stop auto-fitting once the user takes over and
    // (2) persist only user-driven framing as the "home" view.
    const onMoveStart = (e: maplibregl.MapLibreEvent & { originalEvent?: Event }) => {
      if (e.originalEvent) hasUserMovedRef.current = true;
    };
    const onMoveEnd = (e: maplibregl.MapLibreEvent & { originalEvent?: Event }) => {
      if (!e.originalEvent) return;
      const c = m.getCenter();
      savePersistedCamera({ lng: c.lng, lat: c.lat, zoom: m.getZoom() });
    };
    m.on("movestart", onMoveStart);
    m.on("moveend", onMoveEnd);

    const markStyleReady = () => {
      if (m.isStyleLoaded()) setStyleReady(true);
    };
    m.on("styledata", markStyleReady);
    m.on("load", () => setStyleReady(true));
    markStyleReady();

    m.on("error", (e) => {
      const msg = String(e?.error?.message ?? "");
      if (msg.includes(".pmtiles") || msg.includes("tiles_not_downloaded")) {
        setTilesMissing(true);
      }
    });

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const target = e.originalEvent.target as HTMLElement | null;
      if (target?.closest(".vs-marker")) return;
      cbRef.current.onClickEmpty?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    m.on("click", onClick);

    return () => {
      m.off("click", onClick);
      m.off("movestart", onMoveStart);
      m.off("moveend", onMoveEnd);
      for (const mk of markersRef.current.values()) mk.remove();
      markersRef.current.clear();
      m.remove();
      mapRef.current = null;
      setMapInstance(null);
      setStyleReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  // MapLibre measures the container once at construction; on window resize
  // or sidebar mount it needs an explicit map.resize() to refresh transform
  // dimensions.
  useEffect(() => {
    const el = containerRef.current;
    const map = mapInstance;
    if (!el || !map) return;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapInstance]);

  // Sync VS markers with the list.
  useEffect(() => {
    const map = mapInstance;
    if (!map || !vsQuery.data) return;
    const current = markersRef.current;
    const next = new Map<number, Marker>();

    for (const v of vsQuery.data) {
      let marker = current.get(v.id);
      if (!marker) {
        const el = document.createElement("button");
        el.className = markerClass(v.id === selectedVSID);
        el.setAttribute("data-vs-name", v.name);
        el.setAttribute("data-vs-id", String(v.id));
        el.title = `PB ${v.name}`;
        marker = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat([v.lon, v.lat])
          .addTo(map);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          cbRef.current.onClickVS?.(v);
        });
        marker.on("dragend", () => {
          const ll = marker!.getLngLat();
          patch.mutate({ id: v.id, patch: { lat: ll.lat, lon: ll.lng } });
        });
      } else {
        marker.setLngLat([v.lon, v.lat]);
        const el = marker.getElement();
        el.className = markerClass(v.id === selectedVSID);
        el.setAttribute("data-vs-name", v.name);
      }
      next.set(v.id, marker);
    }
    for (const [id, m] of current) {
      if (!next.has(id)) m.remove();
    }
    markersRef.current = next;
  }, [vsQuery.data, patch, mapInstance, selectedVSID]);

  // Initial-camera framing. Runs whenever data lands; bails after the first
  // successful fit, or once the user starts panning. `styleReady` matters
  // because fitBounds before the style is loaded silently no-ops.
  useEffect(() => {
    const map = mapInstance;
    if (!map || !styleReady) return;
    if (hasFittedRef.current || hasUserMovedRef.current) return;

    const racesGpx: RaceTrack[] = [];
    if (selectedRaceID != null && raceTrack.data) {
      const coords: Array<[number, number]> = [];
      for (const f of raceTrack.data.features) {
        for (const c of f.geometry.coordinates) coords.push([c[0], c[1]]);
      }
      if (coords.length > 0) racesGpx.push({ coords });
    }

    const result = computeInitialCamera({
      selectedVSID: selectedVSID ?? null,
      selectedRaceID: selectedRaceID ?? null,
      vsList: vsQuery.data ?? [],
      racesGpx,
      raceGpxLoading: selectedRaceID != null && raceTrack.isLoading,
      persisted: loadPersistedCamera(),
    });

    if (result.kind === "none") return;
    if (result.kind === "center") {
      map.jumpTo({ center: [result.lng, result.lat], zoom: result.zoom });
    } else {
      map.fitBounds(
        [
          [result.minLng, result.minLat],
          [result.maxLng, result.maxLat],
        ],
        { padding: 60, maxZoom: 14, animate: false },
      );
    }
    hasFittedRef.current = true;
  }, [
    mapInstance,
    styleReady,
    selectedVSID,
    selectedRaceID,
    vsQuery.data,
    raceTrack.data,
    raceTrack.isLoading,
  ]);

  const visibleFor = (id: number) => raceVisibility[id] ?? true;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {tilesMissing && source.kind === "pmtiles" && (
        <div className="absolute left-4 bottom-4 max-w-md rounded-md bg-amber-100 p-4 text-sm text-amber-900 shadow">
          <strong>Map tiles missing.</strong> The pmtiles archive for region{" "}
          <code>{source.region}</code> isn't available. Wait for the download to finish or copy it
          into the <code>tiles/</code> directory.
        </div>
      )}
      {races.data?.map((r) => (
        <RacePolyline
          key={r.id}
          map={mapInstance}
          styleReady={styleReady}
          race={r}
          visible={visibleFor(r.id)}
        />
      ))}
    </div>
  );
}

function markerClass(selected: boolean): string {
  // `maplibregl-marker` is what MapLibre adds in its Marker constructor; it
  // sets position:absolute + top/left:0. We then overwrite className on every
  // selection change, so we have to include it here or the marker falls back
  // to static flow and each one drifts by its flow Y (24 px per marker).
  const base =
    "maplibregl-marker vs-marker grid h-6 w-6 place-items-center rounded-full border-2 text-xs font-semibold shadow";
  return selected
    ? `${base} border-yellow-400 bg-yellow-500 text-slate-900`
    : `${base} border-white bg-slate-900 text-white`;
}
