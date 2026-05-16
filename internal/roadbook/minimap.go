package roadbook

import "errors"

// ErrMiniMapNotImplemented is returned by RenderMiniMap until the
// vector-pmtiles rasterization story is solved. In v1 the toggle exists in
// settings but is grayed out; the renderer treats this error as "skip block".
var ErrMiniMapNotImplemented = errors.New("roadbook: mini-map rasterizer not implemented in v1")

// RenderMiniMap is a stub. See M08 risks: vector pmtiles → PNG has no
// off-the-shelf pure-Go solution. The function exists so the renderer can
// call it uniformly; v1 just returns the sentinel error.
func RenderMiniMap(_ int, _ any, _ []VSReference) ([]byte, error) {
	return nil, ErrMiniMapNotImplemented
}
