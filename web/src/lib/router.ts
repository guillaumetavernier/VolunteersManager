import { useEffect, useState } from "react";

// Tiny hash-based router. The full TanStack Router setup is overkill for v1
// when we only need three views and want to stay reverse-proxy friendly. The
// URL shape is `/#/races/123`.

export interface Route {
  path: string; // canonical path, e.g. "/races/42"
  params: Record<string, string>;
}

export function readRoute(): Route {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  return { path: hash, params: {} };
}

export function navigate(path: string) {
  if (!path.startsWith("/")) path = "/" + path;
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => readRoute());
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

// matchRoute returns the captured params if the path matches the pattern,
// otherwise null. Patterns use `:name` segments.
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split("/").filter(Boolean);
  const tp = path.split("/").filter(Boolean);
  if (pp.length !== tp.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) {
      out[pp[i].slice(1)] = decodeURIComponent(tp[i]);
    } else if (pp[i] !== tp[i]) {
      return null;
    }
  }
  return out;
}
