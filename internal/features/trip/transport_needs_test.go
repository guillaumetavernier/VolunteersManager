package trip

import (
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func TestComputeTransportNeeds_FiltersOverlappingMissions(t *testing.T) {
	dir := t.TempDir()
	s, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	if err := s.Migrate(); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	// Two VS at different places.
	resA, _ := s.DB.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('A', 48.0, 2.0)`)
	resB, _ := s.DB.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('B', 48.1, 2.1)`)
	aID, _ := resA.LastInsertId()
	bID, _ := resB.LastInsertId()

	// One volunteer assigned to two missions on the same day with overlapping
	// time windows. Mission A starts 03:00 and runs to 08:30. Mission B starts
	// 04:00 (while A is still running) at a different VS. Sorting by start_time
	// puts A first; the leg "A.end 08:30 → B.start 04:00" is physically
	// impossible and must NOT be reported as a transport need — the constraint
	// engine surfaces it as a double-booking.
	resV, _ := s.DB.Exec(`INSERT INTO volunteers (first_name, last_name, phone) VALUES ('Léa','Test','+33611111111')`)
	volID, _ := resV.LastInsertId()
	mA, _ := s.DB.Exec(`INSERT INTO missions (vs_id, day, start_time, end_time, role_type, headcount) VALUES (?, 1, '2026-06-01T03:00', '2026-06-01T08:30', 'R', 1)`, aID)
	mB, _ := s.DB.Exec(`INSERT INTO missions (vs_id, day, start_time, end_time, role_type, headcount) VALUES (?, 1, '2026-06-01T04:00', '2026-06-01T09:15', 'R', 1)`, bID)
	mAID, _ := mA.LastInsertId()
	mBID, _ := mB.LastInsertId()
	_, _ = s.DB.Exec(`INSERT INTO assignments (volunteer_id, mission_id) VALUES (?, ?)`, volID, mAID)
	_, _ = s.DB.Exec(`INSERT INTO assignments (volunteer_id, mission_id) VALUES (?, ?)`, volID, mBID)

	h := NewHandler(NewStore(s.DB), s.DB)
	router := chi.NewRouter()
	h.Mount(router)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/transport-needs?day=1", nil)
	router.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}

	body := rr.Body.String()
	if body != "[]" && body != "[]\n" {
		t.Fatalf("expected empty list (overlap should be filtered), got %s", body)
	}
}

func TestComputeTransportNeeds_KeepsActionableLegs(t *testing.T) {
	dir := t.TempDir()
	s, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	if err := s.Migrate(); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	resA, _ := s.DB.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('A', 48.0, 2.0)`)
	resB, _ := s.DB.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('B', 48.1, 2.1)`)
	aID, _ := resA.LastInsertId()
	bID, _ := resB.LastInsertId()
	resV, _ := s.DB.Exec(`INSERT INTO volunteers (first_name, last_name, phone) VALUES ('Léa','Test','+33611111111')`)
	volID, _ := resV.LastInsertId()
	// Mission A 08:00–09:00 at A; Mission B 10:00–11:00 at B. Sane gap.
	mA, _ := s.DB.Exec(`INSERT INTO missions (vs_id, day, start_time, end_time, role_type, headcount) VALUES (?, 1, '2026-06-01T08:00', '2026-06-01T09:00', 'R', 1)`, aID)
	mB, _ := s.DB.Exec(`INSERT INTO missions (vs_id, day, start_time, end_time, role_type, headcount) VALUES (?, 1, '2026-06-01T10:00', '2026-06-01T11:00', 'R', 1)`, bID)
	mAID, _ := mA.LastInsertId()
	mBID, _ := mB.LastInsertId()
	_, _ = s.DB.Exec(`INSERT INTO assignments (volunteer_id, mission_id) VALUES (?, ?)`, volID, mAID)
	_, _ = s.DB.Exec(`INSERT INTO assignments (volunteer_id, mission_id) VALUES (?, ?)`, volID, mBID)

	h := NewHandler(NewStore(s.DB), s.DB)
	router := chi.NewRouter()
	h.Mount(router)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/transport-needs?day=1", nil)
	router.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	if rr.Body.String() == "[]" || rr.Body.String() == "[]\n" {
		t.Fatalf("expected one transport need, got empty: %s", rr.Body.String())
	}
}
