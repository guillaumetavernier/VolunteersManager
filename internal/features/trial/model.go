// Package trial owns Épreuve (Trial) CRUD and GPX attachment for multi-stage races.
package trial

type Trial struct {
	ID        int64   `json:"id"`
	RaceID    int64   `json:"race_id"`
	Sequence  int     `json:"sequence"`
	Name      string  `json:"name"`
	StartTime *string `json:"start_time"`
	FrontPace float64 `json:"front_pace"`
	TailPace  float64 `json:"tail_pace"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

type GPXFile struct {
	ID             int64   `json:"id"`
	RaceID         int64   `json:"race_id"`
	TrialID        *int64  `json:"trial_id"`
	FilePath       string  `json:"file_path"`
	TotalDistanceM float64 `json:"total_distance_m"`
	CreatedAt      string  `json:"created_at"`
}

// TrialVS is a row in race_trial_vs — one PB's timing within one trial.
type TrialVS struct {
	ID             int64   `json:"id"`
	TrialID        int64   `json:"trial_id"`
	VSID           int64   `json:"vs_id"`
	Source         string  `json:"source"` // "auto" | "manual_include" | "manual_exclude"
	DistInTrialM   *float64 `json:"dist_in_trial_m"`
	AutoFirstIn    *string `json:"auto_first_in"`
	AutoLastIn     *string `json:"auto_last_in"`
	ManualFirstIn  *string `json:"manual_first_in"`
	ManualLastIn   *string `json:"manual_last_in"`
}

// ReorderItem is one element of the PUT reorder body.
type ReorderItem struct {
	TrialID  int64 `json:"trial_id"`
	Sequence int   `json:"sequence"`
}

// PatchTrialVS is the body for PUT /api/race_trial_vs/{id}.
type PatchTrialVS struct {
	Source        *string `json:"source,omitempty"`
	ManualFirstIn *string `json:"manual_first_in,omitempty"`
	ManualLastIn  *string `json:"manual_last_in,omitempty"`
}
