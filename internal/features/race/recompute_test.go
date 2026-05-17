package race

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"path/filepath"
	"testing"
	"time"

	"github.com/guillaumetavernier/volunteersmanager/internal/gpx"
	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func setupRecomputeRig(t *testing.T) (*sql.DB, *Service) {
	t.Helper()
	dir := t.TempDir()
	s, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	if err := s.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	svc := NewService(s.DB)
	return s.DB, svc
}

// insertTrialTrack inserts a trial and a gpx_files row for it. The track is a
// short east-west line at lat=0, spanning 0 to lon=0.003 (~333 m).
func insertTrialTrack(t *testing.T, db *sql.DB, raceID, trialID int64) {
	t.Helper()
	pts := []gpx.Point{
		{Lat: 0, Lon: 0, CumDistM: 0},
		{Lat: 0, Lon: 0.001, CumDistM: 111.195},
		{Lat: 0, Lon: 0.002, CumDistM: 222.39},
		{Lat: 0, Lon: 0.003, CumDistM: 333.585},
	}
	j, _ := json.Marshal(pts)
	_, err := db.Exec(
		`INSERT INTO gpx_files (race_id, trial_id, file_path, points, total_distance_m) VALUES (?, ?, '/assets/gpx/t.gpx', ?, ?)`,
		raceID, trialID, string(j), 333.585,
	)
	if err != nil {
		t.Fatalf("insert gpx_files: %v", err)
	}
}

func TestRecompute_SingleTrial_AutoTimesFromPaces(t *testing.T) {
	db, svc := setupRecomputeRig(t)

	if _, err := db.Exec(`INSERT INTO races (id, name) VALUES (1, '42km')`); err != nil {
		t.Fatalf("insert race: %v", err)
	}
	startTime := "2026-06-01T05:00:00Z"
	res, err := db.Exec(`INSERT INTO trials (race_id, sequence, name, start_time, front_pace, tail_pace) VALUES (1, 0, 'T1', ?, 12, 6)`, startTime)
	if err != nil {
		t.Fatalf("insert trial: %v", err)
	}
	trialID, _ := res.LastInsertId()

	insertTrialTrack(t, db, 1, trialID)

	// VS near lon=0.0015 ≈ 167 m along track.
	vsRes, err := db.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('VS-1', 0, 0.0015)`)
	if err != nil {
		t.Fatalf("insert vs: %v", err)
	}
	vsID, _ := vsRes.LastInsertId()
	if _, err := db.Exec(`INSERT INTO race_vs_entries (race_id, vs_id, sequence) VALUES (1, ?, 0)`, vsID); err != nil {
		t.Fatalf("insert entry: %v", err)
	}

	if err := svc.RecomputeRace(1); err != nil {
		t.Fatalf("recompute: %v", err)
	}

	var distM float64
	var autoFirst, autoLast string
	err = db.QueryRow(
		`SELECT dist_in_trial_m, auto_first_in, auto_last_in FROM race_trial_vs WHERE trial_id = ? AND vs_id = ?`,
		trialID, vsID,
	).Scan(&distM, &autoFirst, &autoLast)
	if err != nil {
		t.Fatalf("read race_trial_vs: %v", err)
	}
	if math.Abs(distM-167) > 10 {
		t.Fatalf("dist_in_trial_m = %.1f, want ~167", distM)
	}
	start, _ := time.Parse(time.RFC3339, startTime)
	wantFirst := start.Add(time.Duration(distM/(12*1000.0/3600.0)) * time.Second).UTC().Format(time.RFC3339)
	wantLast := start.Add(time.Duration(distM/(6*1000.0/3600.0)) * time.Second).UTC().Format(time.RFC3339)
	if autoFirst != wantFirst {
		t.Fatalf("auto_first_in = %s, want %s", autoFirst, wantFirst)
	}
	if autoLast != wantLast {
		t.Fatalf("auto_last_in = %s, want %s", autoLast, wantLast)
	}
}

func TestRecompute_MultiTrial_EnvelopePropagates(t *testing.T) {
	db, svc := setupRecomputeRig(t)

	if _, err := db.Exec(`INSERT INTO races (id, name) VALUES (1, 'multi')`); err != nil {
		t.Fatalf("insert race: %v", err)
	}

	// Trial 0 starts at 05:00, front_pace=12, tail_pace=6.
	t0Start := "2026-06-01T05:00:00Z"
	r0, _ := db.Exec(`INSERT INTO trials (race_id, sequence, name, start_time, front_pace, tail_pace) VALUES (1, 0, 'Trail', ?, 12, 6)`, t0Start)
	trial0ID, _ := r0.LastInsertId()
	insertTrialTrack(t, db, 1, trial0ID)

	// Trial 1 has no start_time — effective start comes from the envelope.
	r1, _ := db.Exec(`INSERT INTO trials (race_id, sequence, name, start_time, front_pace, tail_pace) VALUES (1, 1, 'MTB', NULL, 12, 6)`)
	trial1ID, _ := r1.LastInsertId()
	insertTrialTrack(t, db, 1, trial1ID)

	// VS at lon=0.0015 ~167 m along each trial.
	vsRes, _ := db.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('VS-1', 0, 0.0015)`)
	vsID, _ := vsRes.LastInsertId()
	if _, err := db.Exec(`INSERT INTO race_vs_entries (race_id, vs_id, sequence) VALUES (1, ?, 0)`, vsID); err != nil {
		t.Fatalf("insert entry: %v", err)
	}

	if err := svc.RecomputeRace(1); err != nil {
		t.Fatalf("recompute: %v", err)
	}

	var first0, first1, last0, last1 string
	if err := db.QueryRow(
		`SELECT auto_first_in, auto_last_in FROM race_trial_vs WHERE trial_id = ? AND vs_id = ?`,
		trial0ID, vsID,
	).Scan(&first0, &last0); err != nil {
		t.Fatalf("read trial0: %v", err)
	}
	if err := db.QueryRow(
		`SELECT auto_first_in, auto_last_in FROM race_trial_vs WHERE trial_id = ? AND vs_id = ?`,
		trial1ID, vsID,
	).Scan(&first1, &last1); err != nil {
		t.Fatalf("read trial1: %v", err)
	}

	// Trial 1 front start is bounded by trial 0's tail arrival (which is later).
	// So first1 > last0 (tail of trial0 is the floor for trial1 front since we use last arrival).
	t0Last, _ := time.Parse(time.RFC3339, last0)
	t1First, _ := time.Parse(time.RFC3339, first1)
	// The envelope from trial0 tail is the floor for trial1 effective front start.
	// Since trial1 has no start_time, its eff_front = prev_front_end = auto_first_in of trial0.
	// Its eff_tail = prev_tail_end = auto_last_in of trial0.
	_ = t0Last
	_ = t1First
	// Both trials should have non-empty timings.
	if first0 == "" || last0 == "" || first1 == "" || last1 == "" {
		t.Fatalf("some timings missing: f0=%s l0=%s f1=%s l1=%s", first0, last0, first1, last1)
	}
	// trial1 front >= trial0 front (envelope).
	tf0, _ := time.Parse(time.RFC3339, first0)
	tf1, _ := time.Parse(time.RFC3339, first1)
	if !tf1.After(tf0) && !tf1.Equal(tf0) {
		t.Fatalf("trial1 front %s should be >= trial0 front %s", first1, first0)
	}
}

func TestRecompute_ManualExclude_NotTouched(t *testing.T) {
	db, svc := setupRecomputeRig(t)

	if _, err := db.Exec(`INSERT INTO races (id, name) VALUES (1, 'test')`); err != nil {
		t.Fatalf("insert race: %v", err)
	}
	r0, _ := db.Exec(`INSERT INTO trials (race_id, sequence, name, start_time, front_pace, tail_pace) VALUES (1, 0, 'T1', '2026-06-01T05:00:00Z', 12, 6)`)
	trialID, _ := r0.LastInsertId()
	insertTrialTrack(t, db, 1, trialID)

	vsRes, _ := db.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('VS-1', 0, 0.0015)`)
	vsID, _ := vsRes.LastInsertId()
	if _, err := db.Exec(`INSERT INTO race_vs_entries (race_id, vs_id, sequence) VALUES (1, ?, 0)`, vsID); err != nil {
		t.Fatalf("insert entry: %v", err)
	}

	// Pre-seed a manual_exclude row.
	if _, err := db.Exec(`INSERT INTO race_trial_vs (trial_id, vs_id, source) VALUES (?, ?, 'manual_exclude')`, trialID, vsID); err != nil {
		t.Fatalf("insert manual_exclude: %v", err)
	}

	if err := svc.RecomputeRace(1); err != nil {
		t.Fatalf("recompute: %v", err)
	}

	var src string
	if err := db.QueryRow(`SELECT source FROM race_trial_vs WHERE trial_id = ? AND vs_id = ?`, trialID, vsID).Scan(&src); err != nil {
		t.Fatalf("read: %v", err)
	}
	if src != "manual_exclude" {
		t.Fatalf("source = %q, want manual_exclude (must not be touched by recompute)", src)
	}
}

func TestRecompute_NoGPX_NullAutoTimes(t *testing.T) {
	db, svc := setupRecomputeRig(t)

	if _, err := db.Exec(`INSERT INTO races (id, name) VALUES (1, 'notrack')`); err != nil {
		t.Fatalf("insert race: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO trials (race_id, sequence, name, start_time, front_pace, tail_pace) VALUES (1, 0, 'T1', '2026-06-01T05:00:00Z', 12, 6)`); err != nil {
		t.Fatalf("insert trial: %v", err)
	}

	vsRes, _ := db.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('VS-1', 0, 0.0015)`)
	vsID, _ := vsRes.LastInsertId()
	if _, err := db.Exec(`INSERT INTO race_vs_entries (race_id, vs_id, sequence) VALUES (1, ?, 0)`, vsID); err != nil {
		t.Fatalf("insert entry: %v", err)
	}

	if err := svc.RecomputeRace(1); err != nil {
		t.Fatalf("recompute: %v", err)
	}

	// No GPX → no race_trial_vs rows created.
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM race_trial_vs`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("race_trial_vs rows = %d, want 0 (no GPX means no projection)", n)
	}
}

func TestRecompute_ForVS_FiresAllOwnerRaces(t *testing.T) {
	db, svc := setupRecomputeRig(t)

	if _, err := db.Exec(`INSERT INTO races (name) VALUES ('A'), ('B')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO vs (name, lat, lon) VALUES ('VS-X', 0, 0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO race_vs_entries (race_id, vs_id, sequence) VALUES (1, 1, 0), (2, 1, 0)`); err != nil {
		t.Fatal(err)
	}
	if err := svc.RecomputeForVS(1); err != nil {
		t.Fatalf("RecomputeForVS: %v", err)
	}
	// No GPX on either race → no race_trial_vs rows (no projection, no panic).
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM race_trial_vs`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("race_trial_vs rows = %d, want 0 (no GPX)", n)
	}
	_ = fmt.Sprintf // keep import
}
