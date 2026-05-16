import { describe, expect, it } from "vitest";

import { readRoadbookSettings, writeRoadbookSettings } from "../api";
import { defaultRoadbookSettings } from "../types";

describe("roadbook settings serialization", () => {
  it("defaults when no event settings provided", () => {
    const got = readRoadbookSettings("");
    expect(got.primary_color).toBeTruthy();
    expect(got.section_order.length).toBeGreaterThan(0);
  });

  it("round-trips through write/read", () => {
    const rb = defaultRoadbookSettings();
    rb.primary_color = "#ff00aa";
    rb.header_text = "Bienvenue";
    rb.section_visible.sponsor = true;
    const blob = writeRoadbookSettings(JSON.stringify({ region: "fr" }), rb);
    expect(JSON.parse(blob).region).toBe("fr");
    const back = readRoadbookSettings(blob);
    expect(back.primary_color).toBe("#ff00aa");
    expect(back.header_text).toBe("Bienvenue");
    expect(back.section_visible.sponsor).toBe(true);
  });

  it("preserves visibility defaults when input lacks them", () => {
    const blob = JSON.stringify({ roadbook: { primary_color: "#000000" } });
    const got = readRoadbookSettings(blob);
    expect(got.primary_color).toBe("#000000");
    expect(got.section_visible.header).toBe(true);
  });
});
