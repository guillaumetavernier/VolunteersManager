import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";

import "maplibre-gl/dist/maplibre-gl.css";

import { useVSList } from "@/features/vs/hooks";
import { usePatchVS } from "@/features/vs/hooks";
import type { VS } from "@/features/vs/api";
import { useRaces } from "@/features/race/hooks";
import { RacePolyline } from "@/features/race/RacePolylines";

import { buildMapStyle } from "./style";

interface Props {
  region: string;
  onClickEmpty?: (loc: { lat: number; lon: number }) => void;
  onClickVS?: (vs: VS) => void;
  selectedVSID?: number | null;
  raceVisibility: Record<number, boolean>;
}

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

export function MapView({
  region,
  onClickEmpty,
  onClickVS,
  selectedVSID,
  raceVisibility,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Map<number, Marker>>(new Map());
  const [mapInstance, setMapInstance] = useState<MLMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [tilesMissing, setTilesMissing] = useState(false);

  const vsQuery = useVSList();
  const patch = usePatchVS();
  const races = useRaces();

  // Latest callbacks via a ref so the map's `click` handler always sees the
  // current closure without forcing a teardown.
  const cbRef = useRef({ onClickEmpty, onClickVS });
  cbRef.current = { onClickEmpty, onClickVS };

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
      center: [2.349014, 48.864716],
      zoom: 5,
    });
    mapRef.current = m;
    setMapInstance(m);
    (window as unknown as { __map?: MLMap }).__map = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");

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
      for (const mk of markersRef.current.values()) mk.remove();
      markersRef.current.clear();
      m.remove();
      mapRef.current = null;
      setMapInstance(null);
      setStyleReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

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
        el.title = `VS ${v.name}`;
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

  const visibleFor = (id: number) => raceVisibility[id] ?? true;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
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
    </div>
  );
}

function markerClass(selected: boolean): string {
  const base =
    "vs-marker grid h-6 w-6 -translate-y-3 place-items-center rounded-full border-2 text-xs font-semibold shadow";
  return selected
    ? `${base} border-yellow-400 bg-yellow-500 text-slate-900`
    : `${base} border-white bg-slate-900 text-white`;
}
