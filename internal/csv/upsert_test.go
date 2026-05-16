package csv

import (
	"testing"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/volunteer"
)

func vr(idx int, fn, ln, phone string) ValidatedRow {
	return ValidatedRow{Index: idx, Input: volunteer.Input{FirstName: fn, LastName: ln, Phone: phone}}
}

func vol(id int64, fn, ln string) volunteer.Volunteer {
	return volunteer.Volunteer{ID: id, FirstName: fn, LastName: ln}
}

func volWithEmail(id int64, email string) volunteer.Volunteer {
	e := email
	return volunteer.Volunteer{ID: id, Email: &e}
}

func TestClassify_NewWhenNoMatch(t *testing.T) {
	decs := Classify([]ValidatedRow{vr(0, "A", "B", "+33611111111")}, nil, UpsertByName)
	if decs[0].Class != ClassNew {
		t.Fatalf("class = %v", decs[0].Class)
	}
}

func TestClassify_UpdateWhenSingleMatch(t *testing.T) {
	existing := []volunteer.Volunteer{vol(7, "Marie", "Dupont")}
	rows := []ValidatedRow{vr(0, "marie", "dupont", "+33611111111")}
	decs := Classify(rows, existing, UpsertByName)
	if decs[0].Class != ClassUpdate {
		t.Fatalf("class = %v", decs[0].Class)
	}
	if decs[0].TargetID == nil || *decs[0].TargetID != 7 {
		t.Fatalf("target = %v", decs[0].TargetID)
	}
}

func TestClassify_AmbiguousWhenMultipleMatch(t *testing.T) {
	existing := []volunteer.Volunteer{
		vol(1, "Jean", "Martin"),
		vol(2, "Jean", "Martin"),
	}
	decs := Classify([]ValidatedRow{vr(0, "Jean", "Martin", "+33611111111")}, existing, UpsertByName)
	if decs[0].Class != ClassAmbiguous {
		t.Fatalf("class = %v", decs[0].Class)
	}
	if len(decs[0].Candidates) != 2 {
		t.Fatalf("candidates = %v", decs[0].Candidates)
	}
}

func TestClassify_ByEmail(t *testing.T) {
	existing := []volunteer.Volunteer{volWithEmail(9, "marie@example.org")}
	in := volunteer.Input{FirstName: "X", LastName: "Y", Phone: "+33611111111", Email: strPtr("Marie@Example.org")}
	rows := []ValidatedRow{{Index: 0, Input: in}}
	decs := Classify(rows, existing, UpsertByEmail)
	if decs[0].Class != ClassUpdate {
		t.Fatalf("class = %v", decs[0].Class)
	}
}

func TestClassify_ErrorRowsStayErrors(t *testing.T) {
	r := vr(0, "", "B", "+33611111111")
	r.Errors = []string{"first_name_required"}
	decs := Classify([]ValidatedRow{r}, nil, UpsertByName)
	if decs[0].Class != ClassError {
		t.Fatalf("class = %v", decs[0].Class)
	}
}

func TestTally(t *testing.T) {
	decs := []RowDecision{
		{Class: ClassNew},
		{Class: ClassNew},
		{Class: ClassUpdate},
		{Class: ClassAmbiguous},
		{Class: ClassError},
		{Class: ClassSkip},
	}
	c := Tally(decs)
	if c.New != 2 || c.Update != 1 || c.Ambiguous != 1 || c.Error != 1 || c.Skip != 1 {
		t.Fatalf("counts = %+v", c)
	}
}
