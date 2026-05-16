package csv

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/volunteer"
)

// CommitResult counts the actual mutations made.
type CommitResult struct {
	Inserted int `json:"inserted"`
	Updated  int `json:"updated"`
	Skipped  int `json:"skipped"`
}

// Commit applies all NEW + UPDATE decisions in one transaction. Errors and
// ambiguous-without-resolution rows are skipped. The function is all-or-nothing
// at the SQL level: a single failed row rolls back the whole import.
func Commit(db *sql.DB, decisions []RowDecision) (CommitResult, error) {
	tx, err := db.Begin()
	if err != nil {
		return CommitResult{}, err
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback()
		}
	}()

	var res CommitResult
	for _, d := range decisions {
		switch d.Class {
		case ClassNew:
			if err := insertVolunteer(tx, d); err != nil {
				return CommitResult{}, fmt.Errorf("row %d insert: %w", d.Row.Index+1, err)
			}
			res.Inserted++
		case ClassUpdate:
			if d.TargetID == nil {
				res.Skipped++
				continue
			}
			if err := updateVolunteer(tx, *d.TargetID, d); err != nil {
				return CommitResult{}, fmt.Errorf("row %d update: %w", d.Row.Index+1, err)
			}
			res.Updated++
		default:
			res.Skipped++
		}
	}

	if err := tx.Commit(); err != nil {
		return CommitResult{}, err
	}
	tx = nil
	return res, nil
}

func insertVolunteer(tx *sql.Tx, d RowDecision) error {
	in := d.Row.Input
	roleJSON, _ := json.Marshal(emptyIfNil(in.RoleTypes))
	availJSON, _ := json.Marshal(emptyAvail(in.Availability))
	const q = `INSERT INTO volunteers (
		first_name, last_name, phone, email,
		emergency_contact_name, emergency_contact_phone,
		general_info, customizable_message, role_types, availability,
		default_vs_id, can_drive, license_type, notes, archived
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := tx.Exec(q,
		in.FirstName, in.LastName, in.Phone, in.Email,
		in.EmergencyContactName, in.EmergencyContactPhone,
		in.GeneralInfo, in.CustomizableMessage, string(roleJSON), string(availJSON),
		in.DefaultVSID, boolInt(in.CanDrive), in.LicenseType, in.Notes, 0,
	)
	return err
}

func updateVolunteer(tx *sql.Tx, id int64, d RowDecision) error {
	in := d.Row.Input
	present := d.Row.Present

	sets := []string{
		"first_name = ?",
		"last_name = ?",
		"phone = ?",
		"email = COALESCE(?, email)",
		"emergency_contact_name = COALESCE(?, emergency_contact_name)",
		"emergency_contact_phone = COALESCE(?, emergency_contact_phone)",
		"general_info = COALESCE(?, general_info)",
		"customizable_message = COALESCE(?, customizable_message)",
		"license_type = COALESCE(?, license_type)",
		"notes = COALESCE(?, notes)",
	}
	args := []any{
		in.FirstName, in.LastName, in.Phone, in.Email,
		in.EmergencyContactName, in.EmergencyContactPhone,
		in.GeneralInfo, in.CustomizableMessage,
		in.LicenseType, in.Notes,
	}
	if present["role_types"] {
		roleJSON, _ := json.Marshal(emptyIfNil(in.RoleTypes))
		sets = append(sets, "role_types = ?")
		args = append(args, string(roleJSON))
	}
	if present["can_drive"] {
		sets = append(sets, "can_drive = ?")
		args = append(args, boolInt(in.CanDrive))
	}
	sets = append(sets, "updated_at = datetime('now')")

	q := fmt.Sprintf("UPDATE volunteers SET %s WHERE id = ?", strings.Join(sets, ", "))
	args = append(args, id)
	_, err := tx.Exec(q, args...)
	return err
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func emptyIfNil(xs []string) []string {
	if xs == nil {
		return []string{}
	}
	return xs
}

func emptyAvail(xs []volunteer.Availability) []volunteer.Availability {
	if xs == nil {
		return []volunteer.Availability{}
	}
	return xs
}
