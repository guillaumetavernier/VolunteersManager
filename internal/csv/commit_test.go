package csv

import (
	"bytes"
	"path/filepath"
	"testing"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/volunteer"
	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func newDB(t *testing.T) (*store.Store, *volunteer.Store) {
	t.Helper()
	dir := t.TempDir()
	s, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	if err := s.Migrate(); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	return s, volunteer.NewStore(s.DB)
}

func TestCommit_InsertsAndUpdates(t *testing.T) {
	s, vs := newDB(t)
	existing, err := vs.Create(volunteer.Input{FirstName: "Marie", LastName: "Dupont", Phone: "+33611111111"})
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	rows := []ValidatedRow{
		{Index: 0, Input: volunteer.Input{FirstName: "Jean", LastName: "Martin", Phone: "+33611111112"}},
		{Index: 1, Input: volunteer.Input{FirstName: "Marie", LastName: "Dupont", Phone: "+33611111113"}},
	}
	decisions := Classify(rows, []volunteer.Volunteer{existing}, UpsertByName)
	res, err := Commit(s.DB, decisions)
	if err != nil {
		t.Fatalf("Commit: %v", err)
	}
	if res.Inserted != 1 || res.Updated != 1 {
		t.Fatalf("result = %+v", res)
	}
	got, err := vs.Get(existing.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Phone != "+33611111113" {
		t.Fatalf("phone not updated, got %q", got.Phone)
	}
	all, _ := vs.List(volunteer.Filter{})
	if len(all) != 2 {
		t.Fatalf("len = %d", len(all))
	}
}

func TestCommit_UpdatePreservesAbsentCanDriveAndRoleTypes(t *testing.T) {
	s, vs := newDB(t)
	existing, err := vs.Create(volunteer.Input{
		FirstName: "Marie",
		LastName:  "Dupont",
		Phone:     "+33611111111",
		CanDrive:  true,
		RoleTypes: []string{"Ravitaillement"},
	})
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	// CSV maps only first_name, last_name, phone — can_drive and role_types
	// are absent. Their zero values must NOT overwrite existing DB values.
	rows := []ValidatedRow{
		{
			Index: 0,
			Input: volunteer.Input{
				FirstName: "Marie",
				LastName:  "Dupont",
				Phone:     "+33699999999",
			},
			Present: map[string]bool{
				"first_name": true,
				"last_name":  true,
				"phone":      true,
			},
		},
	}
	decisions := Classify(rows, []volunteer.Volunteer{existing}, UpsertByName)
	if _, err := Commit(s.DB, decisions); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	got, err := vs.Get(existing.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Phone != "+33699999999" {
		t.Fatalf("phone not updated: got %q", got.Phone)
	}
	if !got.CanDrive {
		t.Fatalf("can_drive was wiped; want true")
	}
	if len(got.RoleTypes) != 1 || got.RoleTypes[0] != "Ravitaillement" {
		t.Fatalf("role_types wiped; got %v", got.RoleTypes)
	}
}

func TestCommit_RoundtripExportImport(t *testing.T) {
	// End-to-end: seed 5 volunteers; export → re-import → expect 0 new, 5 updates.
	s, vs := newDB(t)
	for i := 0; i < 5; i++ {
		fn := []string{"A", "B", "C", "D", "E"}[i]
		_, err := vs.Create(volunteer.Input{FirstName: fn, LastName: "X", Phone: "+3361111111" + string(rune('0'+i))})
		if err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	vols, _ := vs.List(volunteer.Filter{})

	// Write export.
	var buf bytes.Buffer
	if err := WriteExport(&buf, vols); err != nil {
		t.Fatalf("WriteExport: %v", err)
	}

	parsed, err := Parse(&buf)
	if err != nil {
		t.Fatalf("re-parse: %v", err)
	}
	mapping := AutoMap(parsed.Headers)
	rows := Validate(parsed, mapping, "FR")
	for i, r := range rows {
		if len(r.Errors) > 0 {
			t.Fatalf("row %d errors = %v", i, r.Errors)
		}
	}
	existing, _ := vs.List(volunteer.Filter{Archived: "all"})
	decisions := Classify(rows, existing, UpsertByName)
	c := Tally(decisions)
	if c.New != 0 || c.Update != 5 || c.Ambiguous != 0 {
		t.Fatalf("counts = %+v", c)
	}
	res, err := Commit(s.DB, decisions)
	if err != nil {
		t.Fatalf("Commit: %v", err)
	}
	if res.Inserted != 0 || res.Updated != 5 {
		t.Fatalf("result = %+v", res)
	}
}

