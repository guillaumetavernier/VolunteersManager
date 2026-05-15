// Package racevs owns the ordered VS list attached to a race, including the
// per-entry manual-override times that take precedence over auto-computed ones.
package racevs

type Entry struct {
	ID             int64    `json:"id"`
	RaceID         int64    `json:"race_id"`
	VSID           int64    `json:"vs_id"`
	Sequence       int      `json:"sequence"`
	ProjectedDistM *float64 `json:"projected_dist_m"`
	AutoFirstIn    *string  `json:"auto_first_in"`
	AutoLastIn     *string  `json:"auto_last_in"`
	ManualFirstIn  *string  `json:"manual_first_in"`
	ManualLastIn   *string  `json:"manual_last_in"`
}

// PutOrderItem is one element of the PUT body that replaces the whole list.
type PutOrderItem struct {
	VSID     int64 `json:"vs_id"`
	Sequence int   `json:"sequence"`
}

// PatchTimes is the body for PATCH /api/races/{id}/vs/{vsId}.
type PatchTimes struct {
	ManualFirstIn *string `json:"manual_first_in,omitempty"`
	ManualLastIn  *string `json:"manual_last_in,omitempty"`
}
