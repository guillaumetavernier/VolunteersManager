import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useGanttHeight, type UseGanttHeight } from "../useGanttHeight";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  current: UseGanttHeight;
  root: Root;
  container: HTMLDivElement;
}

function mountHook(): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const harness = { current: undefined as unknown as UseGanttHeight, root, container };
  function Probe() {
    harness.current = useGanttHeight();
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  return harness;
}

function unmount(h: Harness) {
  act(() => {
    h.root.unmount();
  });
  h.container.remove();
}

function setInnerHeight(px: number) {
  (window as unknown as { innerHeight: number }).innerHeight = px;
}

describe("useGanttHeight", () => {
  beforeEach(() => {
    localStorage.clear();
    setInnerHeight(1000);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to 40% of viewport on first mount and collapsed=false", () => {
    const h = mountHook();
    expect(h.current.heightPx).toBe(400);
    expect(h.current.collapsed).toBe(false);
    unmount(h);
  });

  it("clamps small setHeightPx up to 80", () => {
    const h = mountHook();
    act(() => {
      h.current.setHeightPx(50);
    });
    expect(h.current.heightPx).toBe(80);
    unmount(h);
  });

  it("clamps huge setHeightPx down to 0.7 * innerHeight", () => {
    const h = mountHook();
    act(() => {
      h.current.setHeightPx(99999);
    });
    expect(h.current.heightPx).toBe(700);
    unmount(h);
  });

  it("persists heightPx across remount", () => {
    const h1 = mountHook();
    act(() => {
      h1.current.setHeightPx(300);
    });
    expect(h1.current.heightPx).toBe(300);
    unmount(h1);

    const h2 = mountHook();
    expect(h2.current.heightPx).toBe(300);
    unmount(h2);
  });

  it("toggleCollapsed flips and persists", () => {
    const h1 = mountHook();
    act(() => {
      h1.current.toggleCollapsed();
    });
    expect(h1.current.collapsed).toBe(true);
    unmount(h1);

    const h2 = mountHook();
    expect(h2.current.collapsed).toBe(true);
    act(() => {
      h2.current.toggleCollapsed();
    });
    expect(h2.current.collapsed).toBe(false);
    unmount(h2);
  });

  it("re-clamps on window resize when stored height exceeds new max", () => {
    const h = mountHook();
    act(() => {
      h.current.setHeightPx(600);
    });
    expect(h.current.heightPx).toBe(600);

    act(() => {
      setInnerHeight(200);
      window.dispatchEvent(new Event("resize"));
    });
    expect(h.current.heightPx).toBe(140);
    unmount(h);
  });
});
