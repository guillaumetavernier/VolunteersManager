// Package roadbook owns the maroto v2 deterministic PDF pipeline that produces
// per-volunteer roadbooks and the coordinator master document.
package roadbook

import "github.com/guillaumetavernier/volunteersmanager/internal/domain/constraints"

// CoStaff is a co-worker on the same mission. Only name + role + phone are
// disclosed (no email, no address, no emergency contact — privacy).
type CoStaff struct {
	ID    int64
	Name  string
	Role  string
	Phone string
}

// CoPassenger is a fellow rider on the same trip stop. Same privacy rules.
type CoPassenger struct {
	ID    int64
	Name  string
	Phone string
	// Role described in human form: "Conducteur", "Passager", etc.
	Role string
}

// MissionBlock is a day-level block representing a single mission assignment.
type MissionBlock struct {
	MissionID int64
	VSID      int64
	VSName    string
	Title     string
	StartTime string // HH:MM
	EndTime   string // HH:MM
	RoleType  string
	CoStaff   []CoStaff
}

// TripBlock is a day-level block representing a trip the volunteer is part of.
type TripBlock struct {
	TripID       int64
	IsDriver     bool
	Stops        []TripStopRow
	CoPassengers []CoPassenger
}

// TripStopRow is one stop on a trip block.
type TripStopRow struct {
	Sequence int
	VSID     int64
	VSName   string
	Time     string // HH:MM
	Action   string // "" | "board" | "alight" | "drive"
}

// IdleBlock fills a gap between mission/trip blocks.
type IdleBlock struct {
	FromTime string // HH:MM
	ToTime   string // HH:MM
}

// DayBlock holds the ordered list of blocks for a single calendar day.
type DayBlock struct {
	Day      int
	Missions []MissionBlock
	Trips    []TripBlock
	Idles    []IdleBlock
	// Ordered combined timeline (used by the renderer). Each entry is one of
	// the three pointer fields above.
	Timeline []TimelineEntry
}

// TimelineKind discriminates TimelineEntry payloads.
type TimelineKind string

const (
	KindMission TimelineKind = "mission"
	KindTrip    TimelineKind = "trip"
	KindIdle    TimelineKind = "idle"
)

// TimelineEntry is the polymorphic day block produced by gather.
type TimelineEntry struct {
	Kind    TimelineKind
	Mission *MissionBlock
	Trip    *TripBlock
	Idle    *IdleBlock
	// SortKey is "HH:MM" used for ordering (start time).
	SortKey string
}

// VSReference is a footer-only block listing every VS in the event.
type VSReference struct {
	ID         int64
	Name       string
	Lat        float64
	Lon        float64
	Notes      string
	What3Words string
}

// VolunteerRoadbook is the typed input to the per-volunteer renderer.
type VolunteerRoadbook struct {
	EventName        string
	EventStartDate   string
	EventEndDate     string
	LogoPath         string // filesystem path or empty
	SponsorPath      string // filesystem path or empty
	CoordinatorName  string
	CoordinatorPhone string

	VolunteerID         int64
	FirstName           string
	LastName            string
	Phone               string
	Email               string
	EmergencyContact    string // "name — phone" composite
	GeneralInfo         string
	CustomizableMessage string
	DefaultVSName       string
	DefaultVSID         int64

	Days       []DayBlock
	References []VSReference
}

// EventState is the engine snapshot the master/volunteer renderers consume.
// We re-use constraints.EventState for cross-cutting reads + add the few
// extra fields the engine doesn't track (names, photo, etc.).
type EventState struct {
	Engine      constraints.EventState
	EventName   string
	StartDate   string
	EndDate     string
	LogoPath    string
	SponsorPath string
	CoordName   string
	CoordPhone  string

	// Lookup tables.
	VolunteerByID map[int64]VolunteerProfile
	MissionByID   map[int64]MissionMeta
	VSByID        map[int64]VSReference
	References    []VSReference
	VolunteerIDs  []int64 // sorted
}

type VolunteerProfile struct {
	ID                  int64
	FirstName           string
	LastName            string
	Phone               string
	Email               string
	EmergencyName       string
	EmergencyPhone      string
	GeneralInfo         string
	CustomizableMessage string
	DefaultVSID         int64
	RoleTypes           []string
	Archived            bool
}

type MissionMeta struct {
	ID       int64
	VSID     int64
	VSName   string
	Day      int
	Start    string
	End      string
	RoleType string
	Title    string
}
