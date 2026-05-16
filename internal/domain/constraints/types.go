// Package constraints owns the warning engine. Compute is a pure function on
// EventState that produces a stable, sorted list of advisory warnings. The
// engine never mutates state and never returns an error: it lists what is
// wrong and lets the caller decide what to do.
package constraints

type Severity string

const (
	SeverityInfo  Severity = "info"
	SeverityWarn  Severity = "warn"
	SeverityError Severity = "error"
)

type WarningKind string

const (
	KindDoubleBooking         WarningKind = "double_booking"
	KindRoleMismatch          WarningKind = "role_mismatch"
	KindAvailabilityViolation WarningKind = "availability_violation"
	KindExcessiveDuty         WarningKind = "excessive_duty"
	KindNoBreak               WarningKind = "no_break"
	KindUnderstaffed          WarningKind = "understaffed"
	KindOverstaffed           WarningKind = "overstaffed"
	KindUnassigned            WarningKind = "unassigned"
	KindMissingPhone          WarningKind = "missing_phone_with_assignments"
)

type EntityType string

const (
	EntityVolunteer  EntityType = "volunteer"
	EntityMission    EntityType = "mission"
	EntityAssignment EntityType = "assignment"
)

type EntityRef struct {
	Type EntityType `json:"type"`
	ID   int64      `json:"id"`
}

// Fix is reserved for v1.x; the engine always returns nil here.
type Fix struct {
	Description string `json:"description"`
}

type Warning struct {
	ID           string      `json:"id"`
	Kind         WarningKind `json:"kind"`
	Severity     Severity    `json:"severity"`
	Message      string      `json:"message"`
	Entities     []EntityRef `json:"entities"`
	SuggestedFix *Fix        `json:"suggested_fix,omitempty"`
}

// AvailabilityWindow mirrors volunteer.Availability without importing it
// (keeps the engine package free of feature dependencies).
type AvailabilityWindow struct {
	Day   int
	Start string // HH:MM
	End   string // HH:MM
}

type Volunteer struct {
	ID           int64
	FirstName    string
	LastName     string
	Phone        string
	RoleTypes    []string
	Availability []AvailabilityWindow
	Archived     bool
}

type Mission struct {
	ID        int64
	Day       int
	StartTime string // HH:MM
	EndTime   string // HH:MM
	RoleType  string
	Headcount int
	Title     string
}

type Assignment struct {
	ID          int64
	MissionID   int64
	VolunteerID int64
}

// Settings holds engine thresholds. Defaults applied by LoadState.
type Settings struct {
	MaxDutyHours        float64 // default 10
	NoBreakAfterHours   float64 // default 6
	NoBreakMinGapMins   float64 // default 30
}

type EventState struct {
	Volunteers  []Volunteer
	Missions    []Mission
	Assignments []Assignment
	Settings    Settings
}

func DefaultSettings() Settings {
	return Settings{
		MaxDutyHours:      10,
		NoBreakAfterHours: 6,
		NoBreakMinGapMins: 30,
	}
}
