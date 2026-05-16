package csv

import (
	"strings"
	"testing"
)

func TestNormalizePhone_FRWithoutPrefix(t *testing.T) {
	got, ok := NormalizePhone("06 11 11 11 11", "FR")
	if !ok {
		t.Fatalf("ok = false")
	}
	if got != "+33611111111" {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizePhone_SwissAtFrenchEvent(t *testing.T) {
	got, ok := NormalizePhone("+41 79 123 45 67", "FR")
	if !ok {
		t.Fatalf("ok = false")
	}
	if got != "+41791234567" {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizePhone_Bad(t *testing.T) {
	if _, ok := NormalizePhone("not a phone", "FR"); ok {
		t.Fatalf("expected !ok")
	}
}

func TestValidate_RequiresFirstLastPhone(t *testing.T) {
	body := "Prénom;Nom;Téléphone\n;Dupont;+33611111111\nMarie;;+33611111111\nMarie;Dupont;\n"
	p, _ := Parse(strings.NewReader(body))
	mapping := AutoMap(p.Headers)
	rows := Validate(p, mapping, "FR")
	for i, r := range rows {
		if len(r.Errors) == 0 {
			t.Errorf("row %d: expected errors", i)
		}
	}
}

func TestValidate_NormalizesPhoneAndRoles(t *testing.T) {
	// Semicolons inside the role column would be split by the CSV parser
	// (they're the delimiter) — use a pipe in the field instead.
	body := "Prénom;Nom;Téléphone;Rôles\nMarie;Dupont;06 11 11 11 11;Ravitaillement|Accueil\n"
	p, _ := Parse(strings.NewReader(body))
	rows := Validate(p, AutoMap(p.Headers), "FR")
	if len(rows) != 1 || len(rows[0].Errors) != 0 {
		t.Fatalf("rows[0] errors = %v", rows[0].Errors)
	}
	if rows[0].Input.Phone != "+33611111111" {
		t.Fatalf("phone = %q", rows[0].Input.Phone)
	}
	if len(rows[0].Input.RoleTypes) != 2 {
		t.Fatalf("roles = %v", rows[0].Input.RoleTypes)
	}
}

func TestParseBoolish(t *testing.T) {
	cases := map[string]bool{
		"oui": true, "OUI": true, "yes": true, "1": true, "x": true,
		"non": false, "0": false, "": false, "no": false,
	}
	for in, want := range cases {
		if got := parseBoolish(in); got != want {
			t.Errorf("parseBoolish(%q) = %v, want %v", in, got, want)
		}
	}
}
