// Package mission owns mission CRUD per VS and the derived staffing summary.
package mission

type Mission struct {
	ID            int64    `json:"id"`
	VSID          int64    `json:"vs_id"`
	Day           int      `json:"day"`
	StartTime     string   `json:"start_time"`
	EndTime       string   `json:"end_time"`
	RoleType      string   `json:"role_type"`
	Headcount     int      `json:"headcount"`
	Title         *string  `json:"title"`
	Description   *string  `json:"description"`
	TaggedRaceIDs []int64  `json:"tagged_race_ids"`
	Assigned      int      `json:"assigned"`
	Needed        int      `json:"needed"`
	Status        string   `json:"status"`
	CreatedAt     string   `json:"created_at"`
	UpdatedAt     string   `json:"updated_at"`
}

type Input struct {
	VSID          int64   `json:"vs_id,omitempty"`
	Day           int     `json:"day"`
	StartTime     string  `json:"start_time"`
	EndTime       string  `json:"end_time"`
	RoleType      string  `json:"role_type"`
	Headcount     int     `json:"headcount"`
	Title         *string `json:"title,omitempty"`
	Description   *string `json:"description,omitempty"`
	TaggedRaceIDs []int64 `json:"tagged_race_ids,omitempty"`
}

type Patch struct {
	Day           *int     `json:"day,omitempty"`
	StartTime     *string  `json:"start_time,omitempty"`
	EndTime       *string  `json:"end_time,omitempty"`
	RoleType      *string  `json:"role_type,omitempty"`
	Headcount     *int     `json:"headcount,omitempty"`
	Title         *string  `json:"title,omitempty"`
	Description   *string  `json:"description,omitempty"`
	TaggedRaceIDs *[]int64 `json:"tagged_race_ids,omitempty"`
}

type Filter struct {
	VSID *int64
	Day  *int
	Role *string
	Race *int64
}
