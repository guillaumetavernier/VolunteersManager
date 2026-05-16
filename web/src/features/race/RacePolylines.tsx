import { useEffect } from "react";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";

import { type Race, type GeoJSON } from "./api";
import { useRaceTrack } from "./hooks";

interface Props {
  map: MLMap | null;
  styleReady: boolean;
  race: Race;
  visible: boolean;
}

// RacePolyline owns a single source + line layer pair for one race. Mounting
// adds the source/layer; unmounting removes them so this composes cleanly with
// the toggle in the sidebar.
export function RacePolyline({ map, styleReady, race, visible }: Props) {
  const track = useRaceTrack(race.id);

  useEffect(() => {
    if (!map || !track.data) return;
    const sourceID = `race-${race.id}`;
    const layerID = `race-line-${race.id}`;

    // addSource throws when called before the style JSON has been parsed. We
    // try once, fall back to the next styledata event if MapLibre rejected
    // us. `styleReady` is the happy-path signal; the styledata fallback is
    // for the offline-tiles case where 'load' never fires.
    const tryAdd = (): boolean => {
      try {
        if (!map.getSource(sourceID)) {
          map.addSource(sourceID, { type: "geojson", data: track.data as GeoJSON });
        } else {
          (map.getSource(sourceID) as GeoJSONSource).setData(track.data as GeoJSON);
        }
        if (!map.getLayer(layerID)) {
          map.addLayer({
            id: layerID,
            type: "line",
            source: sourceID,
            paint: { "line-color": race.color, "line-width": 3 },
          });
        } else {
          map.setPaintProperty(layerID, "line-color", race.color);
        }
        map.setLayoutProperty(layerID, "visibility", visible ? "visible" : "none");
        return true;
      } catch {
        return false;
      }
    };

    let added = tryAdd();
    let onStyleData: (() => void) | null = null;
    if (!added) {
      onStyleData = () => {
        if (added) return;
        if (tryAdd()) {
          added = true;
          map.off("styledata", onStyleData!);
        }
      };
      map.on("styledata", onStyleData);
    }

    return () => {
      if (onStyleData) map.off("styledata", onStyleData);
      try {
        if (map.getLayer(layerID)) map.removeLayer(layerID);
        if (map.getSource(sourceID)) map.removeSource(sourceID);
      } catch {
        // Map may have been torn down already; ignore.
      }
    };
  }, [map, styleReady, race.id, race.color, visible, track.data]);

  return null;
}
