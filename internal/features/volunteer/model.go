// Package volunteer owns volunteer CRUD and the canonical roster shape used by
// CSV import/export.
package volunteer

type Availability struct {
	Day   int    `json:"day"`
	Start string `json:"start"`
	End   string `json:"end"`
}

type Volunteer struct {
	ID                    int64          `json:"id"`
	FirstName             string         `json:"first_name"`
	LastName              string         `json:"last_name"`
	Phone                 string         `json:"phone"`
	Email                 *string        `json:"email"`
	EmergencyContactName  *string        `json:"emergency_contact_name"`
	EmergencyContactPhone *string        `json:"emergency_contact_phone"`
	GeneralInfo           *string        `json:"general_info"`
	CustomizableMessage   *string        `json:"customizable_message"`
	RoleTypes             []string       `json:"role_types"`
	Availability          []Availability `json:"availability"`
	DefaultVSID           *int64         `json:"default_vs_id"`
	CanDrive              bool           `json:"can_drive"`
	LicenseType           *string        `json:"license_type"`
	Notes                 *string        `json:"notes"`
	Archived              bool           `json:"archived"`
	CreatedAt             string         `json:"created_at"`
	UpdatedAt             string         `json:"updated_at"`
}

type Input struct {
	FirstName             string         `json:"first_name"`
	LastName              string         `json:"last_name"`
	Phone                 string         `json:"phone"`
	Email                 *string        `json:"email,omitempty"`
	EmergencyContactName  *string        `json:"emergency_contact_name,omitempty"`
	EmergencyContactPhone *string        `json:"emergency_contact_phone,omitempty"`
	GeneralInfo           *string        `json:"general_info,omitempty"`
	CustomizableMessage   *string        `json:"customizable_message,omitempty"`
	RoleTypes             []string       `json:"role_types,omitempty"`
	Availability          []Availability `json:"availability,omitempty"`
	DefaultVSID           *int64         `json:"default_vs_id,omitempty"`
	CanDrive              bool           `json:"can_drive,omitempty"`
	LicenseType           *string        `json:"license_type,omitempty"`
	Notes                 *string        `json:"notes,omitempty"`
	Archived              bool           `json:"archived,omitempty"`
}

// Patch fields are pointers so the handler can tell "absent" from "explicit nil".
type Patch struct {
	FirstName             *string         `json:"first_name,omitempty"`
	LastName              *string         `json:"last_name,omitempty"`
	Phone                 *string         `json:"phone,omitempty"`
	Email                 *string         `json:"email,omitempty"`
	EmergencyContactName  *string         `json:"emergency_contact_name,omitempty"`
	EmergencyContactPhone *string         `json:"emergency_contact_phone,omitempty"`
	GeneralInfo           *string         `json:"general_info,omitempty"`
	CustomizableMessage   *string         `json:"customizable_message,omitempty"`
	RoleTypes             *[]string       `json:"role_types,omitempty"`
	Availability          *[]Availability `json:"availability,omitempty"`
	DefaultVSID           *int64          `json:"default_vs_id,omitempty"`
	CanDrive              *bool           `json:"can_drive,omitempty"`
	LicenseType           *string         `json:"license_type,omitempty"`
	Notes                 *string         `json:"notes,omitempty"`
	Archived              *bool           `json:"archived,omitempty"`
}
