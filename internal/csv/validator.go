package csv

import (
	"strings"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/volunteer"
	"github.com/guillaumetavernier/volunteersmanager/internal/phone"
)

// ValidatedRow is the shape that flows through to upsert.go. Errors[] is
// non-empty when validation failed; the row is then skipped at commit but kept
// visible in the preview so the user can fix and re-upload.
//
// Present records which canonical fields were mapped in the CSV (regardless of
// whether the cell was empty). Update commits use it to skip SET clauses for
// columns the CSV didn't carry, so a re-import with a narrower column set does
// not wipe pre-existing values.
type ValidatedRow struct {
	Index   int               `json:"index"`
	Input   volunteer.Input   `json:"input"`
	Raw     map[string]string `json:"raw"`
	Present map[string]bool   `json:"present,omitempty"`
	Errors  []string          `json:"errors,omitempty"`
}

// Validate maps each parsed CSV row through (column → field) and produces a
// ValidatedRow. Phone numbers are normalized via phonenumbers; an unknown phone
// is a row error.
func Validate(parsed *Parsed, mapping map[int]string, countryFallback string) []ValidatedRow {
	present := map[string]bool{}
	for _, key := range mapping {
		if key == "" {
			continue
		}
		present[key] = true
	}

	out := make([]ValidatedRow, 0, len(parsed.Rows))
	for i, row := range parsed.Rows {
		raw := map[string]string{}
		fieldVals := map[string]string{}
		for col, key := range mapping {
			if col < 0 || col >= len(row) {
				continue
			}
			val := strings.TrimSpace(row[col])
			raw[key] = val
			fieldVals[key] = val
		}

		rowPresent := make(map[string]bool, len(present))
		for k, v := range present {
			rowPresent[k] = v
		}
		vr := ValidatedRow{Index: i, Raw: raw, Present: rowPresent}
		var errs []string

		fn := fieldVals["first_name"]
		ln := fieldVals["last_name"]
		ph := fieldVals["phone"]

		if fn == "" {
			errs = append(errs, "first_name_required")
		}
		if ln == "" {
			errs = append(errs, "last_name_required")
		}
		if ph == "" {
			errs = append(errs, "phone_required")
		} else {
			norm, ok := NormalizePhone(ph, countryFallback)
			if !ok {
				errs = append(errs, "phone_invalid")
			} else {
				ph = norm
			}
		}

		in := volunteer.Input{
			FirstName: fn,
			LastName:  ln,
			Phone:     ph,
		}
		if v, ok := fieldVals["email"]; ok && v != "" {
			s := strings.ToLower(v)
			in.Email = &s
		}
		if v, ok := fieldVals["emergency_contact_name"]; ok && v != "" {
			in.EmergencyContactName = strPtr(v)
		}
		if v, ok := fieldVals["emergency_contact_phone"]; ok && v != "" {
			if norm, normOk := NormalizePhone(v, countryFallback); normOk {
				in.EmergencyContactPhone = &norm
			} else {
				in.EmergencyContactPhone = strPtr(v)
			}
		}
		if v, ok := fieldVals["general_info"]; ok && v != "" {
			in.GeneralInfo = strPtr(v)
		}
		if v, ok := fieldVals["customizable_message"]; ok && v != "" {
			in.CustomizableMessage = strPtr(v)
		}
		if v, ok := fieldVals["role_types"]; ok && v != "" {
			in.RoleTypes = splitRoles(v)
		}
		if v, ok := fieldVals["can_drive"]; ok && v != "" {
			in.CanDrive = parseBoolish(v)
		}
		if v, ok := fieldVals["license_type"]; ok && v != "" {
			in.LicenseType = strPtr(v)
		}
		if v, ok := fieldVals["notes"]; ok && v != "" {
			in.Notes = strPtr(v)
		}

		vr.Input = in
		vr.Errors = errs
		out = append(out, vr)
	}
	return out
}

// NormalizePhone is kept as a thin wrapper for backward-compat with existing
// callers; new code should import internal/phone directly.
func NormalizePhone(p, country string) (string, bool) {
	return phone.Normalize(p, country)
}

func splitRoles(s string) []string {
	parts := strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == ';' || r == '|' || r == '/'
	})
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func parseBoolish(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes", "y", "oui", "vrai", "x":
		return true
	}
	return false
}

func strPtr(s string) *string { return &s }
