// Package race owns Race CRUD and the recompute service that keeps
// race_trial_vs projected distances + auto times in sync across trials.
package race

type Race struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type GPXFile struct {
	ID             int64   `json:"id"`
	RaceID         int64   `json:"race_id"`
	TrialID        *int64  `json:"trial_id"`
	FilePath       string  `json:"file_path"`
	Points         string  `json:"-"` // JSON blob; not returned in API responses by default
	TotalDistanceM float64 `json:"total_distance_m"`
	CreatedAt      string  `json:"created_at"`
}

type Patch struct {
	Name  *string `json:"name,omitempty"`
	Color *string `json:"color,omitempty"`
}
