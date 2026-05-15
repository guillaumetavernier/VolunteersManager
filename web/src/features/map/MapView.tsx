import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";

import "maplibre-gl/dist/maplibre-gl.css";

import { useVSList } from "@/features/vs/hooks";
import { usePatchVS } from "@/features/vs/hooks";
import type { VS } from "@/features/vs/api";
import { VsEditPanel, makeDraft, type DraftVS } from "@/features/vs/VsEditPanel";

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
  const [editing, setEditing] = useState<DraftVS | null>(null);
  const [tilesMissing, setTilesMissing] = useState(false);

  const vsQuery = useVSList();
  const patch = usePatchVS();

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
    m.addControl(new maplibregl.NavigationControl(), "top-right");

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
      m.remove();
      mapRef.current = null;
    };
    // We intentionally rebuild only when style changes (region change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  // Sync VS markers with the list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !vsQuery.data) return;
    const current = markersRef.current;
    const next = new Map<number, Marker>();

    for (const v of vsQuery.data) {
      let marker = current.get(v.id);
      if (!marker) {
        const el = document.createElement("button");
        el.className =
          "vs-marker grid h-6 w-6 -translate-y-3 place-items-center rounded-full border-2 border-white bg-slate-900 text-xs font-semibold text-white shadow";
        el.setAttribute("aria-label", `VS ${v.name}`);
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
  }, [vsQuery.data, patch]);

  function openEditFor(v: VS) {
    setEditing(makeDraft(v));
  }

  return (
    <div className="relative h-screen w-screen">
      <div ref={containerRef} className="absolute inset-0" />
      {tilesMissing && (
        <div className="absolute left-4 top-4 max-w-md rounded-md bg-amber-100 p-4 text-sm text-amber-900 shadow">
          <strong>Map tiles missing.</strong> The pmtiles archive for region{" "}
          <code>{region}</code> isn't available. Wait for the download to finish or copy it into
          the <code>tiles/</code> directory.
        </div>
      )}
      {editing && (
        <VsEditPanel draft={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
