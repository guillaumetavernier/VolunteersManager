package trip

import (
	"path/filepath"
	"testing"

	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func newTestStore(t *testing.T) (*Store, int64, int64, int64, int64, int64) {
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
	vsA, _ := s.DB.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('A', 48.0, 2.0)`)
	vsB, _ := s.DB.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('B', 48.1, 2.1)`)
	vsC, _ := s.DB.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('C', 48.2, 2.2)`)
	aID, _ := vsA.LastInsertId()
	bID, _ := vsB.LastInsertId()
	cID, _ := vsC.LastInsertId()
	v1, _ := s.DB.Exec(`INSERT INTO volunteers (first_name, last_name, phone, can_drive) VALUES ('D','Driver','+33611111111',1)`)
	_, _ = s.DB.Exec(`INSERT INTO volunteers (first_name, last_name, phone) VALUES ('P','Pass','+33611111112')`)
	driverID, _ := v1.LastInsertId()
	car, _ := s.DB.Exec(`INSERT INTO cars (name, seats, default_driver_id) VALUES ('Fiat', 4, ?)`, driverID)
	carID, _ := car.LastInsertId()
	return NewStore(s.DB), driverID, carID, aID, bID, cID
}

func TestTripStore_CreateLoadRoundtrip(t *testing.T) {
	st, driverID, carID, aID, bID, cID := newTestStore(t)
	in := Input{
		Day: 1, DriverID: driverID, CarID: carID, Mode: "drive", Notes: "first ride",
		Stops: []StopInput{
			{VSID: aID, Time: "2026-06-01T08:00:00Z", Board: []int64{2}},
			{VSID: bID, Time: "2026-06-01T08:30:00Z", Alight: []int64{2}},
			{VSID: cID, Time: "2026-06-01T09:00:00Z"},
		},
	}
	t1, err := st.Create(in)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if t1.ID == 0 || len(t1.Stops) != 3 {
		t.Fatalf("Create returned %+v", t1)
	}
	if t1.Stops[0].Board[0] != 2 {
		t.Fatalf("stops[0].Board = %v, want [2]", t1.Stops[0].Board)
	}
	if t1.Stops[1].Alight[0] != 2 {
		t.Fatalf("stops[1].Alight = %v, want [2]", t1.Stops[1].Alight)
	}
	if t1.Stops[2].LegTimeSource != "auto" {
		t.Fatalf("default leg_time_source = %q, want auto", t1.Stops[2].LegTimeSource)
	}
}

func TestTripStore_ReplaceDeletesOldStops(t *testing.T) {
	st, driverID, carID, aID, bID, cID := newTestStore(t)
	in := Input{
		Day: 1, DriverID: driverID, CarID: carID, Mode: "drive",
		Stops: []StopInput{
			{VSID: aID, Time: "T1"},
			{VSID: bID, Time: "T2"},
			{VSID: cID, Time: "T3"},
		},
	}
	t1, err := st.Create(in)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	in.Stops = []StopInput{
		{VSID: aID, Time: "T1bis"},
		{VSID: cID, Time: "T2bis"},
	}
	t2, err := st.Replace(t1.ID, in)
	if err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if len(t2.Stops) != 2 {
		t.Fatalf("after Replace stops=%d, want 2", len(t2.Stops))
	}
	if t2.Stops[0].Time != "T1bis" || t2.Stops[1].VSID != cID {
		t.Fatalf("Replace did not overwrite: %+v", t2)
	}
}

func TestTripStore_Delete(t *testing.T) {
	st, driverID, carID, aID, bID, cID := newTestStore(t)
	_ = cID
	in := Input{Day: 1, DriverID: driverID, CarID: carID, Stops: []StopInput{
		{VSID: aID, Time: "T1"}, {VSID: bID, Time: "T2"},
	}}
	t1, err := st.Create(in)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := st.Delete(t1.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := st.Get(t1.ID); err == nil {
		t.Fatalf("expected not found after Delete")
	}
}

func TestTripStore_DriverAndCarLookup(t *testing.T) {
	st, driverID, carID, aID, bID, _ := newTestStore(t)
	in := Input{Day: 1, DriverID: driverID, CarID: carID, Stops: []StopInput{
		{VSID: aID, Time: "T1"}, {VSID: bID, Time: "T2"},
	}}
	if _, err := st.Create(in); err != nil {
		t.Fatalf("Create: %v", err)
	}
	tIDs, err := st.TripsByDriver(driverID)
	if err != nil || len(tIDs) != 1 {
		t.Fatalf("TripsByDriver = %v err=%v", tIDs, err)
	}
	cIDs, err := st.TripsByCar(carID)
	if err != nil || len(cIDs) != 1 {
		t.Fatalf("TripsByCar = %v err=%v", cIDs, err)
	}
}

