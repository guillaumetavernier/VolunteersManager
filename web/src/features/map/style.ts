import { layers, namedTheme } from "protomaps-themes-base";
import type { StyleSpecification } from "maplibre-gl";

// Locked theme variant: "light". Same name on both code paths so vector
// schema, fonts, and sprites stay consistent between pmtiles and online.
const THEME = namedTheme("light");

const GLYPHS = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";
const SPRITE = "https://protomaps.github.io/basemaps-assets/sprites/v4/light";
const PROTOMAPS_ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>';

export type TileSource =
  | { kind: "pmtiles"; region: string; attribution?: string }
  | { kind: "online"; url_template: string; attribution?: string }
  | { kind: "openfreemap"; style_url: string; attribution?: string };

// buildMapStyle dispatches to the right MapLibre style based on the tile
// source resolved by the backend at /api/tiles/source. OpenFreeMap returns
// a string URL — MapLibre fetches the hosted style JSON at runtime and
// resolves its own glyphs, sprites, sources, and layers.
export function buildMapStyle(source: TileSource): StyleSpecification | string {
  if (source.kind === "openfreemap") {
    return source.style_url;
  }
  if (source.kind === "online") {
    return buildOnlineStyle(source.url_template, source.attribution);
  }
  return buildOfflineStyle(source.region, source.attribution);
}

export function buildOfflineStyle(region: string, attribution?: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sprite: SPRITE,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${pmtilesAbsoluteURL(region)}`,
        attribution: attribution || PROTOMAPS_ATTRIBUTION,
      },
    },
    layers: layers("protomaps", THEME, { lang: "fr" }),
  };
}

export function buildOnlineStyle(urlTemplate: string, attribution?: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sprite: SPRITE,
    sources: {
      protomaps: {
        type: "vector",
        tiles: [urlTemplate],
        minzoom: 0,
        maxzoom: 15,
        attribution: attribution || PROTOMAPS_ATTRIBUTION,
      },
    },
    layers: layers("protomaps", THEME, { lang: "fr" }),
  };
}

function pmtilesAbsoluteURL(region: string): string {
  if (typeof window === "undefined") return `/tiles/${region}.pmtiles`;
  return new URL(`/tiles/${region}.pmtiles`, window.location.origin).toString();
}
