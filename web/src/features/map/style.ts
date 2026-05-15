import { layers, namedTheme } from "protomaps-themes-base";
import type { StyleSpecification } from "maplibre-gl";

// Locked theme variant for M01: "light". See docs/milestones/STATE.md open
// questions for the prior options.
const THEME = namedTheme("light");

export function buildMapStyle(region: string): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${pmtilesAbsoluteURL(region)}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", THEME, { lang: "fr" }),
  };
}

function pmtilesAbsoluteURL(region: string): string {
  if (typeof window === "undefined") return `/tiles/${region}.pmtiles`;
  return new URL(`/tiles/${region}.pmtiles`, window.location.origin).toString();
}
