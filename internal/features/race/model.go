// Package race owns Race CRUD, GPX file management, and the recompute service
// that keeps race_vs_entries projected distances + auto times in sync.
package race

type Race struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	Color     string  `json:"color"`
	FrontPace float64 `json:"front_pace"`
	TailPace  float64 `json:"tail_pace"`
	StartTime *string `json:"start_time"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

type GPXFile struct {
	ID             int64   `json:"id"`
	RaceID         int64   `json:"race_id"`
	Day            *int    `json:"day"`
	FilePath       string  `json:"file_path"`
	Points         string  `json:"-"` // JSON blob; not returned in API responses by default
	TotalDistanceM float64 `json:"total_distance_m"`
	CreatedAt      string  `json:"created_at"`
}

type Patch struct {
	Name      *string  `json:"name,omitempty"`
	Color     *string  `json:"color,omitempty"`
	FrontPace *float64 `json:"front_pace,omitempty"`
	TailPace  *float64 `json:"tail_pace,omitempty"`
	StartTime *string  `json:"start_time,omitempty"`
}
