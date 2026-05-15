import { describe, expect, it } from "vitest";
import { t } from "../i18n";

describe("t", () => {
  it("returns the key when missing", () => {
    expect(t("missing.key")).toBe("missing.key");
  });
  it("interpolates args even on missing keys", () => {
    expect(t("hello.{name}", { name: "Alice" })).toBe("hello.Alice");
  });
});
