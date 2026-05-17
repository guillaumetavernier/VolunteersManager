import { describe, expect, it } from "vitest";

import { buildMapStyle, buildOfflineStyle, buildOnlineStyle } from "../style";

describe("style builders", () => {
  it("buildOfflineStyle points the source at the local pmtiles URL", () => {
    const s = buildOfflineStyle("europe-france");
    const src = s.sources.protomaps as { type: string; url?: string; tiles?: string[] };
    expect(src.type).toBe("vector");
    expect(src.url).toMatch(/^pmtiles:\/\/.*\/tiles\/europe-france\.pmtiles$/);
    expect(src.tiles).toBeUndefined();
  });

  it("buildOnlineStyle uses the URL template as a vector tiles[] source", () => {
    const tpl = "https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=pk_test";
    const s = buildOnlineStyle(tpl);
    const src = s.sources.protomaps as { type: string; url?: string; tiles?: string[] };
    expect(src.type).toBe("vector");
    expect(src.tiles).toEqual([tpl]);
    expect(src.url).toBeUndefined();
  });

  it("buildMapStyle dispatches on source.kind", () => {
    const off = buildMapStyle({ kind: "pmtiles", region: "europe-uk" });
    const on = buildMapStyle({
      kind: "online",
      url_template: "https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=pk_x",
    });
    expect((off.sources.protomaps as { url?: string }).url).toContain("europe-uk.pmtiles");
    expect((on.sources.protomaps as { tiles?: string[] }).tiles?.[0]).toContain("pk_x");
  });

  it("both styles share the same glyphs and sprite endpoints", () => {
    const off = buildOfflineStyle("europe-france");
    const on = buildOnlineStyle("https://example/{z}/{x}/{y}.mvt");
    expect(off.glyphs).toBe(on.glyphs);
    expect(off.sprite).toBe(on.sprite);
  });
});
