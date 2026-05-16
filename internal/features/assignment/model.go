// Package assignment owns assignment CRUD between volunteers and missions.
package assignment

type Assignment struct {
	ID          int64  `json:"id"`
	MissionID   int64  `json:"mission_id"`
	VolunteerID int64  `json:"volunteer_id"`
	CreatedAt   string `json:"created_at"`
}

type Input struct {
	MissionID   int64 `json:"mission_id"`
	VolunteerID int64 `json:"volunteer_id"`
}
