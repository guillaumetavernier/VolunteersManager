// Package vs owns Volunteer Spot CRUD and photo uploads.
package vs

type VS struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Lat        float64 `json:"lat"`
	Lon        float64 `json:"lon"`
	Notes      *string `json:"notes"`
	PhotoPath  *string `json:"photo_path"`
	What3Words *string `json:"what3words"`
	CreatedAt  string  `json:"created_at"`
	UpdatedAt  string  `json:"updated_at"`
}

// Patch is the partial-update payload for PATCH /api/vs/{id}.
// All fields are pointers so the handler can distinguish "absent" from "explicit nil".
type Patch struct {
	Name       *string  `json:"name,omitempty"`
	Lat        *float64 `json:"lat,omitempty"`
	Lon        *float64 `json:"lon,omitempty"`
	Notes      *string  `json:"notes,omitempty"`
	What3Words *string  `json:"what3words,omitempty"`
}
