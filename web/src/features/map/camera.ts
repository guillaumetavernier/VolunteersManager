// Camera state for the main MapView: priority-ordered initial framing and
// versioned localStorage persistence. Pure module — no DOM, no MapLibre.

const STORAGE_KEY = "vm:map:camera";

// Lyon centre: matches the typical event region without needing a country bbox
// table. Used only as the floor of the priority order when nothing else is
// available (no selection, no persisted view, no VS, no race tracks).
export const FALLBACK_CENTER: { lng: number; lat: number; zoom: number } = {
  lng: 4.8357,
  lat: 45.764,
  zoom: 5,
};

export interface PersistedCamera {
  lng: number;
  lat: number;
  zoom: number;
  v: 1;
}

export type InitialCamera =
  | { kind: "center"; lng: number; lat: number; zoom: number }
  | { kind: "bounds"; minLng: number; minLat: number; maxLng: number; maxLat: number }
  | { kind: "none" };

export interface VsPoint {
  id: number;
  lat: number;
  lon: number;
}

export interface RaceTrack {
  coords: Array<[number, number]>;
}

export interface ComputeInput {
  selectedVSID: number | null;
  selectedRaceID: number | null;
  vsList: VsPoint[];
  racesGpx: RaceTrack[];
  raceGpxLoading: boolean;
  persisted: PersistedCamera | null;
}

const SELECTED_VS_ZOOM = 15;

export function computeInitialCamera(input: ComputeInput): InitialCamera {
  // 1. Selected VS wins — user clicked a deep link to a specific PB.
  if (input.selectedVSID != null) {
    const vs = input.vsList.find((v) => v.id === input.selectedVSID);
    if (vs) {
      return { kind: "center", lng: vs.lon, lat: vs.lat, zoom: SELECTED_VS_ZOOM };
    }
    if (input.vsList.length === 0) return { kind: "none" };
  }

  // 2. Selected race — fit to that race's GPX. If the GPX hasn't loaded yet
  // we explicitly wait rather than falling through to persisted/global, to
  // avoid a visible double-snap on cold boot of /courses/:id.
  if (input.selectedRaceID != null) {
    if (input.raceGpxLoading) return { kind: "none" };
    const track = input.racesGpx[0];
    if (track && track.coords.length > 0) {
      return bboxOfCoords(track.coords);
    }
  }

  // 3. Persisted user view.
  if (input.persisted) {
    return {
      kind: "center",
      lng: input.persisted.lng,
      lat: input.persisted.lat,
      zoom: input.persisted.zoom,
    };
  }

  // 4. Union of VS + race tracks.
  const allCoords: Array<[number, number]> = [];
  for (const v of input.vsList) allCoords.push([v.lon, v.lat]);
  for (const t of input.racesGpx) {
    for (const c of t.coords) allCoords.push(c);
  }
  if (allCoords.length > 0) return bboxOfCoords(allCoords);

  // 5. Nothing to anchor on.
  return { kind: "none" };
}

function bboxOfCoords(coords: Array<[number, number]>): InitialCamera {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng)) return { kind: "none" };
  return { kind: "bounds", minLng, minLat, maxLng, maxLat };
}

export function loadPersistedCamera(storage: Storage = localStorage): PersistedCamera | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedCamera>;
    if (
      parsed.v !== 1 ||
      typeof parsed.lng !== "number" ||
      typeof parsed.lat !== "number" ||
      typeof parsed.zoom !== "number" ||
      !Number.isFinite(parsed.lng) ||
      !Number.isFinite(parsed.lat) ||
      !Number.isFinite(parsed.zoom)
    ) {
      return null;
    }
    return { lng: parsed.lng, lat: parsed.lat, zoom: parsed.zoom, v: 1 };
  } catch {
    return null;
  }
}

export function savePersistedCamera(
  c: { lng: number; lat: number; zoom: number },
  storage: Storage = localStorage,
): void {
  try {
    const payload: PersistedCamera = { lng: c.lng, lat: c.lat, zoom: c.zoom, v: 1 };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / disabled storage / SSR — silently ignore; the worst case is
    // the camera doesn't restore on next visit.
  }
}
