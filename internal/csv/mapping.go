package csv

import (
	"strings"
	"unicode"

	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// fieldAliases lists header substrings (after lowercase+accent strip) that map
// onto each canonical field key. First match wins.
var fieldAliases = map[string][]string{
	"first_name":              {"prenom", "first name", "firstname"},
	"last_name":               {"nom de famille", "nom", "last name", "lastname", "surname", "family name"},
	"phone":                   {"telephone", "phone", "tel", "mobile", "portable", "numero"},
	"email":                   {"email", "courriel", "e-mail", "mail"},
	"emergency_contact_name":  {"contact urgence nom", "urgence nom", "emergency contact name", "emergency name", "personne a prevenir"},
	"emergency_contact_phone": {"contact urgence telephone", "urgence telephone", "emergency contact phone", "emergency phone", "personne a prevenir telephone"},
	"general_info":            {"infos generales", "informations generales", "general info", "general informations", "infos"},
	"customizable_message":    {"message", "personalised message", "personnalisable", "custom message"},
	"role_types":              {"roles", "role", "type de role", "fonction", "fonctions", "poste"},
	"can_drive":               {"peut conduire", "can drive", "conducteur", "permis", "driver"},
	"license_type":            {"type de permis", "license type", "permis type"},
	"notes":                   {"notes", "remarques", "remarks"},
	"availability":            {"disponibilites", "disponibilite", "availability", "availabilities"},
	"default_vs_id":           {"vs par defaut", "vs defaut", "default vs", "default volunteer spot"},
}

// AutoMap returns a column-index → field-key map by matching header strings
// against fieldAliases. Headers that don't match are left out (the UI lets the
// user override).
func AutoMap(headers []string) map[int]string {
	out := map[int]string{}
	used := map[string]bool{}
	for i, h := range headers {
		norm := normalizeHeader(h)
		for _, f := range CanonicalFields {
			if used[f.Key] {
				continue
			}
			if matches(norm, fieldAliases[f.Key]) {
				out[i] = f.Key
				used[f.Key] = true
				break
			}
		}
	}
	return out
}

func matches(normalizedHeader string, aliases []string) bool {
	for _, a := range aliases {
		if normalizedHeader == a || strings.Contains(normalizedHeader, a) {
			return true
		}
	}
	return false
}

// normalizeHeader lowercases, strips diacritics, replaces punctuation with
// spaces, and collapses whitespace.
func normalizeHeader(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s, _, _ = transform.String(norm.NFD, s)
	var b strings.Builder
	b.Grow(len(s))
	prevSpace := false
	for _, r := range s {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		if r == '_' || r == '-' || r == '/' || r == '.' || r == '(' || r == ')' || r == ',' || r == ';' || r == ':' {
			r = ' '
		}
		if unicode.IsSpace(r) {
			if prevSpace {
				continue
			}
			prevSpace = true
			b.WriteRune(' ')
			continue
		}
		prevSpace = false
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}
