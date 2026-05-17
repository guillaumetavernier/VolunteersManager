// Package racevs owns the ordered VS list attached to a race. Timing data now
// lives in race_trial_vs; this package returns aggregated earliest_first_in /
// latest_last_in across all trials.
package racevs

type Entry struct {
	ID             int64    `json:"id"`
	RaceID         int64    `json:"race_id"`
	VSID           int64    `json:"vs_id"`
	Sequence       int      `json:"sequence"`
	ProjectedDistM *float64 `json:"projected_dist_m"`
	EarliestFirstIn *string `json:"earliest_first_in"`
	LatestLastIn   *string  `json:"latest_last_in"`
}

// PutOrderItem is one element of the PUT body that replaces the whole list.
type PutOrderItem struct {
	VSID     int64 `json:"vs_id"`
	Sequence int   `json:"sequence"`
}
