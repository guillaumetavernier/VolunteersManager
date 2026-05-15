import { describe, expect, it } from "vitest";
import { eventRegion } from "../hooks";

describe("eventRegion", () => {
  it("returns null when event is missing", () => {
    expect(eventRegion(null)).toBeNull();
    expect(eventRegion(undefined)).toBeNull();
  });

  it("returns null when settings is not JSON", () => {
    expect(
      eventRegion({
        id: 1,
        name: "",
        start_date: "",
        end_date: "",
        timezone: "",
        country_code: "",
        settings: "not-json",
        created_at: "",
        updated_at: "",
      }),
    ).toBeNull();
  });

  it("returns the region from settings JSON", () => {
    expect(
      eventRegion({
        id: 1,
        name: "",
        start_date: "",
        end_date: "",
        timezone: "",
        country_code: "",
        settings: JSON.stringify({ region: "europe-france" }),
        created_at: "",
        updated_at: "",
      }),
    ).toBe("europe-france");
  });
});
