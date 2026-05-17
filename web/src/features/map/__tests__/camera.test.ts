import { beforeEach, describe, expect, it } from "vitest";

import {
  computeInitialCamera,
  loadPersistedCamera,
  savePersistedCamera,
  type ComputeInput,
} from "../camera";

function baseInput(over: Partial<ComputeInput> = {}): ComputeInput {
  return {
    selectedVSID: null,
    selectedRaceID: null,
    vsList: [],
    racesGpx: [],
    raceGpxLoading: false,
    persisted: null,
    ...over,
  };
}

describe("computeInitialCamera", () => {
  it("centers on the selected VS at zoom 15", () => {
    const r = computeInitialCamera(
      baseInput({
        selectedVSID: 7,
        vsList: [{ id: 7, lon: 4.8, lat: 45.7 }],
        persisted: { lng: 2.3, lat: 48.8, zoom: 12, v: 1 },
      }),
    );
    expect(r).toEqual({ kind: "center", lng: 4.8, lat: 45.7, zoom: 15 });
  });

  it("waits (kind:none) when selected VS not yet in list", () => {
    const r = computeInitialCamera(baseInput({ selectedVSID: 7, vsList: [] }));
    expect(r).toEqual({ kind: "none" });
  });

  it("fits the selected race's GPX bounds", () => {
    const r = computeInitialCamera(
      baseInput({
        selectedRaceID: 3,
        racesGpx: [
          {
            coords: [
              [4.0, 45.0],
              [5.0, 46.0],
            ],
          },
        ],
      }),
    );
    expect(r).toEqual({ kind: "bounds", minLng: 4.0, minLat: 45.0, maxLng: 5.0, maxLat: 46.0 });
  });

  it("waits when the selected race's GPX is still loading", () => {
    const r = computeInitialCamera(
      baseInput({
        selectedRaceID: 3,
        racesGpx: [],
        raceGpxLoading: true,
        persisted: { lng: 2.3, lat: 48.8, zoom: 12, v: 1 },
        vsList: [{ id: 1, lon: 4.8, lat: 45.7 }],
      }),
    );
    expect(r).toEqual({ kind: "none" });
  });

  it("uses the persisted camera when no deep link is set", () => {
    const r = computeInitialCamera(
      baseInput({
        persisted: { lng: 2.3, lat: 48.8, zoom: 12, v: 1 },
        vsList: [{ id: 1, lon: 4.8, lat: 45.7 }],
      }),
    );
    expect(r).toEqual({ kind: "center", lng: 2.3, lat: 48.8, zoom: 12 });
  });

  it("fits the union of VS and race tracks when no selection / persistence", () => {
    const r = computeInitialCamera(
      baseInput({
        vsList: [
          { id: 1, lon: 4.0, lat: 45.0 },
          { id: 2, lon: 5.0, lat: 46.0 },
        ],
        racesGpx: [
          {
            coords: [
              [3.0, 44.0],
              [6.0, 47.0],
            ],
          },
        ],
      }),
    );
    expect(r).toEqual({ kind: "bounds", minLng: 3.0, minLat: 44.0, maxLng: 6.0, maxLat: 47.0 });
  });

  it("returns kind:none when there's nothing to anchor on", () => {
    expect(computeInitialCamera(baseInput())).toEqual({ kind: "none" });
  });
});

class FakeStorage implements Storage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(key: string): string | null {
    return this.m.has(key) ? (this.m.get(key) ?? null) : null;
  }
  key(index: number): string | null {
    return Array.from(this.m.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.m.delete(key);
  }
  setItem(key: string, value: string): void {
    this.m.set(key, value);
  }
}

describe("persisted camera round-trip", () => {
  let s: FakeStorage;
  beforeEach(() => {
    s = new FakeStorage();
  });

  it("save then load returns the same coordinates", () => {
    savePersistedCamera({ lng: 4.8, lat: 45.7, zoom: 13.2 }, s);
    expect(loadPersistedCamera(s)).toEqual({ lng: 4.8, lat: 45.7, zoom: 13.2, v: 1 });
  });

  it("missing key returns null", () => {
    expect(loadPersistedCamera(s)).toBeNull();
  });

  it("invalid JSON returns null", () => {
    s.setItem("vm:map:camera", "{not json");
    expect(loadPersistedCamera(s)).toBeNull();
  });

  it("rejects payloads with the wrong schema version", () => {
    s.setItem("vm:map:camera", JSON.stringify({ lng: 1, lat: 2, zoom: 3, v: 2 }));
    expect(loadPersistedCamera(s)).toBeNull();
  });

  it("rejects payloads with non-finite or missing numbers", () => {
    s.setItem("vm:map:camera", '{"lng":1,"lat":null,"zoom":3,"v":1}');
    expect(loadPersistedCamera(s)).toBeNull();
  });
});
