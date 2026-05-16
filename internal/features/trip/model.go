// Package trip owns trip CRUD: trips, stops, and per-stop board/alight passengers.
// A whole trip is loaded and saved as a single aggregate; updates delete-and-recreate
// the stops + passengers for simplicity.
package trip

type Trip struct {
	ID        int64  `json:"id"`
	Day       int    `json:"day"`
	DriverID  int64  `json:"driver_id"`
	CarID     int64  `json:"car_id"`
	Mode      string `json:"mode"`
	Notes     string `json:"notes"`
	Stops     []Stop `json:"stops"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type Stop struct {
	ID            int64   `json:"id"`
	Sequence      int     `json:"sequence"`
	VSID          int64   `json:"vs_id"`
	Time          string  `json:"time"`
	LegTimeSource string  `json:"leg_time_source"`
	Board         []int64 `json:"board"`
	Alight        []int64 `json:"alight"`
}

// Input is the payload accepted by POST/PUT /api/trips.
type Input struct {
	Day      int         `json:"day"`
	DriverID int64       `json:"driver_id"`
	CarID    int64       `json:"car_id"`
	Mode     string      `json:"mode"`
	Notes    string      `json:"notes"`
	Stops    []StopInput `json:"stops"`
}

type StopInput struct {
	VSID          int64   `json:"vs_id"`
	Time          string  `json:"time"`
	LegTimeSource string  `json:"leg_time_source"`
	Board         []int64 `json:"board"`
	Alight        []int64 `json:"alight"`
}
