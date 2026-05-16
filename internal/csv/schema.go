// Package csv handles the CSV import pipeline (parse → map → validate →
// classify → commit) and the export/template writers.
package csv

// CanonicalFields are the volunteer columns the importer cares about, in the
// order used by export and template downloads. Names here are the "field key"
// the column-mapping API uses; the value is the human-readable canonical header
// the export writes.
var CanonicalFields = []struct {
	Key    string
	Header string
}{
	{"first_name", "Prénom"},
	{"last_name", "Nom"},
	{"phone", "Téléphone"},
	{"email", "Email"},
	{"emergency_contact_name", "Contact urgence (nom)"},
	{"emergency_contact_phone", "Contact urgence (téléphone)"},
	{"general_info", "Infos générales"},
	{"customizable_message", "Message"},
	{"role_types", "Rôles"},
	{"can_drive", "Peut conduire"},
	{"license_type", "Type de permis"},
	{"notes", "Notes"},
}

func CanonicalHeaders() []string {
	out := make([]string, 0, len(CanonicalFields))
	for _, f := range CanonicalFields {
		out = append(out, f.Header)
	}
	return out
}

func CanonicalKeys() []string {
	out := make([]string, 0, len(CanonicalFields))
	for _, f := range CanonicalFields {
		out = append(out, f.Key)
	}
	return out
}
