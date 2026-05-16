import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";

import "maplibre-gl/dist/maplibre-gl.css";

import { navigate } from "@/lib/router";
import { useVSList } from "@/features/vs/hooks";
import { usePatchVS } from "@/features/vs/hooks";
import type { VS } from "@/features/vs/api";
import { VsEditPanel, makeDraft, type DraftVS } from "@/features/vs/VsEditPanel";
import { useRaces } from "@/features/race/hooks";
import { RacePolyline } from "@/features/race/RacePolylines";
import { MissionsPanel } from "@/features/mission/MissionsPanel";

import { buildMapStyle } from "./style";

interface Props {
  region: string;
}

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

export function MapView({ region }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Map<number, Marker>>(new Map());
  const [mapInstance, setMapInstance] = useState<MLMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [editing, setEditing] = useState<DraftVS | null>(null);
  const [missionsVS, setMissionsVS] = useState<VS | null>(null);
  const [tilesMissing, setTilesMissing] = useState(false);
  const [raceVisibility, setRaceVisibility] = useState<Record<number, boolean>>({});

  const vsQuery = useVSList();
  const patch = usePatchVS();
  const races = useRaces();

  // Register the pmtiles archive so MapLibre can read its directory in one round-trip.
  useEffect(() => {
    const archive = new PMTiles(`/tiles/${region}.pmtiles`);
    pmtilesProtocol.add(archive);
    return () => {
      // pmtiles has no removeArchive; leaving it cached is fine on unmount.
    };
  }, [region]);

  const style = useMemo(() => buildMapStyle(region), [region]);

  // Boot MapLibre once.
  useEffect(() => {
    if (!containerRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [2.349014, 48.864716], // Paris fallback; the user pans/zooms to their region
      zoom: 5,
    });
    mapRef.current = m;
    setMapInstance(m);
    // Exposed for Playwright e2e specs that inspect sources/layers. Cheap to
    // leave on in dev; helps debugging too.
    (window as unknown as { __map?: MLMap }).__map = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    // 'load' would also work, but it waits for all basemap tiles. When the
    // pmtiles archive is missing the basemap never resolves, and we still
    // want to render the GPX polylines and VS markers on top.
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
      // Ignore clicks that land on existing markers — the Marker handlers
      // are responsible for those.
      const target = e.originalEvent.target as HTMLElement | null;
      if (target?.closest(".vs-marker")) return;
      setEditing(makeDraft(null, { lat: e.lngLat.lat, lon: e.lngLat.lng }));
    };
    m.on("click", onClick);

    return () => {
      m.off("click", onClick);
      for (const mk of markersRef.current.values()) mk.remove();
      markersRef.current.clear();
      m.remove();
      mapRef.current = null;
      setMapInstance(null);
      setStyleReady(false);
    };
    // We intentionally rebuild only when style changes (region change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  // Sync VS markers with the list. Depends on `mapInstance` so the effect
  // re-runs when navigation remounts MapView and a fresh map is created —
  // otherwise the cached `vsQuery.data` wouldn't trigger another pass and
  // markers would never get `addTo(newMap)`.
  useEffect(() => {
    const map = mapInstance;
    if (!map || !vsQuery.data) return;
    const current = markersRef.current;
    const next = new Map<number, Marker>();

    for (const v of vsQuery.data) {
      let marker = current.get(v.id);
      if (!marker) {
        const el = document.createElement("button");
        el.className =
          "vs-marker grid h-6 w-6 -translate-y-3 place-items-center rounded-full border-2 border-white bg-slate-900 text-xs font-semibold text-white shadow";
        // MapLibre v4's Marker constructor unconditionally rewrites aria-label
        // to "Map marker"; we use a data-* attribute instead so tests and
        // tooling can target a specific VS.
        el.setAttribute("data-vs-name", v.name);
        el.title = `VS ${v.name}`;
        marker = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat([v.lon, v.lat])
          .addTo(map);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openEditFor(v);
        });
        marker.on("dragend", () => {
          const ll = marker!.getLngLat();
          patch.mutate({ id: v.id, patch: { lat: ll.lat, lon: ll.lng } });
        });
      } else {
        marker.setLngLat([v.lon, v.lat]);
      }
      next.set(v.id, marker);
    }
    // Remove markers for VS that no longer exist.
    for (const [id, m] of current) {
      if (!next.has(id)) m.remove();
    }
    markersRef.current = next;
  }, [vsQuery.data, patch, mapInstance]);

  function openEditFor(v: VS) {
    setEditing(makeDraft(v));
  }

  const visibleFor = (id: number) => raceVisibility[id] ?? true;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      <nav className="absolute left-4 top-4 grid w-64 gap-2 rounded-md bg-white/95 p-3 text-sm shadow">
        <div className="flex items-center justify-between">
          <strong>Races</strong>
          <button onClick={() => navigate("/races")} className="text-xs text-slate-600 underline">
            Manage
          </button>
        </div>
        {races.data && races.data.length === 0 && (
          <p className="text-xs text-slate-500">No races yet.</p>
        )}
        <ul className="grid gap-1">
          {races.data?.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={visibleFor(r.id)}
                onChange={(e) => setRaceVisibility((s) => ({ ...s, [r.id]: e.target.checked }))}
                aria-label={`Toggle ${r.name}`}
              />
              <span
                className="h-3 w-3 rounded-full border border-slate-300"
                style={{ backgroundColor: r.color }}
              />
              <span>{r.name}</span>
            </li>
          ))}
        </ul>
      </nav>
      {tilesMissing && (
        <div className="absolute left-4 bottom-4 max-w-md rounded-md bg-amber-100 p-4 text-sm text-amber-900 shadow">
          <strong>Map tiles missing.</strong> The pmtiles archive for region{" "}
          <code>{region}</code> isn't available. Wait for the download to finish or copy it into
          the <code>tiles/</code> directory.
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
      {editing && (
        <VsEditPanel
          draft={editing}
          onClose={() => setEditing(null)}
          onOpenMissions={(v) => {
            setEditing(null);
            setMissionsVS(v);
          }}
        />
      )}
      {missionsVS && <MissionsPanel vs={missionsVS} onClose={() => setMissionsVS(null)} />}
    </div>
  );
}
