import { describe, expect, it } from "vitest";
import { matchRoute } from "../router";

describe("matchRoute", () => {
  it("returns empty params on exact match", () => {
    expect(matchRoute("/races", "/races")).toEqual({});
  });

  it("captures :id segments", () => {
    expect(matchRoute("/races/:id", "/races/42")).toEqual({ id: "42" });
  });

  it("returns null when length mismatches", () => {
    expect(matchRoute("/races/:id", "/races")).toBeNull();
    expect(matchRoute("/races/:id", "/races/42/edit")).toBeNull();
  });

  it("returns null when a static segment doesn't match", () => {
    expect(matchRoute("/races/:id", "/cars/42")).toBeNull();
  });

  it("decodes URI components in params", () => {
    expect(matchRoute("/foo/:name", "/foo/hello%20world")).toEqual({ name: "hello world" });
  });
});
