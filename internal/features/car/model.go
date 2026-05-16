// Package car owns car CRUD; default_driver_id points at a can_drive volunteer.
package car

type Car struct {
	ID              int64   `json:"id"`
	Name            string  `json:"name"`
	Seats           int     `json:"seats"`
	DefaultDriverID *int64  `json:"default_driver_id"`
	Notes           *string `json:"notes"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

type Input struct {
	Name            string  `json:"name"`
	Seats           int     `json:"seats"`
	DefaultDriverID *int64  `json:"default_driver_id,omitempty"`
	Notes           *string `json:"notes,omitempty"`
}

type Patch struct {
	Name            *string `json:"name,omitempty"`
	Seats           *int    `json:"seats,omitempty"`
	DefaultDriverID *int64  `json:"default_driver_id,omitempty"`
	Notes           *string `json:"notes,omitempty"`
}
