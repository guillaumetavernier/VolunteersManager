import { beforeEach, describe, expect, it } from "vitest";

import { useTimelineCursor } from "../useTimelineCursor";

describe("useTimelineCursor", () => {
  beforeEach(() => {
    useTimelineCursor.setState({ cursorTime: 0, playing: false, speed: 1 });
  });

  it("play/pause toggles state", () => {
    useTimelineCursor.getState().play();
    expect(useTimelineCursor.getState().playing).toBe(true);
    useTimelineCursor.getState().pause();
    expect(useTimelineCursor.getState().playing).toBe(false);
  });

  it("seek sets cursorTime", () => {
    useTimelineCursor.getState().seek(12345);
    expect(useTimelineCursor.getState().cursorTime).toBe(12345);
  });

  it("setSpeed updates speed", () => {
    useTimelineCursor.getState().setSpeed(30);
    expect(useTimelineCursor.getState().speed).toBe(30);
  });

  it("tick advances by dt*speed only when playing", () => {
    useTimelineCursor.getState().setSpeed(5);
    useTimelineCursor.getState().tick(1000);
    expect(useTimelineCursor.getState().cursorTime).toBe(0);
    useTimelineCursor.getState().play();
    useTimelineCursor.getState().tick(1000);
    expect(useTimelineCursor.getState().cursorTime).toBe(5000);
  });

  it("toggle flips playing", () => {
    useTimelineCursor.getState().toggle();
    expect(useTimelineCursor.getState().playing).toBe(true);
    useTimelineCursor.getState().toggle();
    expect(useTimelineCursor.getState().playing).toBe(false);
  });
});
