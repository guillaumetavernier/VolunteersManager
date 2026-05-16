package csv

import "testing"

func TestNormalizeHeader(t *testing.T) {
	cases := map[string]string{
		"Prénom":         "prenom",
		"  Téléphone  ":  "telephone",
		"Email":          "email",
		"Personne à prévenir (téléphone)": "personne a prevenir telephone",
	}
	for in, want := range cases {
		if got := normalizeHeader(in); got != want {
			t.Errorf("normalizeHeader(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestAutoMap_FrenchHeaders(t *testing.T) {
	headers := []string{"Prénom", "Nom", "Téléphone", "Email", "Rôles", "Peut conduire"}
	got := AutoMap(headers)
	want := map[int]string{
		0: "first_name",
		1: "last_name",
		2: "phone",
		3: "email",
		4: "role_types",
		5: "can_drive",
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("col %d: got %q, want %q (full: %v)", k, got[k], v, got)
		}
	}
}

func TestAutoMap_EnglishHeaders(t *testing.T) {
	headers := []string{"First Name", "Last Name", "Phone", "Email"}
	got := AutoMap(headers)
	want := map[int]string{0: "first_name", 1: "last_name", 2: "phone", 3: "email"}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("col %d: got %q, want %q", k, got[k], v)
		}
	}
}
