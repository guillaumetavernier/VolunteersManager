package race

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/guillaumetavernier/volunteersmanager/internal/gpx"
)

// Service owns recompute side-effects across races, trials, gpx_files, vs and
// race_trial_vs. It is the single place that turns "something moved" into
// updated dist_in_trial_m / auto_first_in / auto_last_in values.
type Service struct {
	DB *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{DB: db} }

// RecomputeRace walks trials in sequence order, propagates the timing envelope
// across trial boundaries, projects each PB per-trial GPX, and upserts
// race_trial_vs rows. manual_exclude rows are never touched.
func (s *Service) RecomputeRace(raceID int64) error {
	if _, err := (&Store{DB: s.DB}).Get(raceID); errors.Is(err, ErrNotFound) {
		return nil
	} else if err != nil {
		return err
	}

	trials, err := s.loadTrials(raceID)
	if err != nil {
		return err
	}
	if len(trials) == 0 {
		return nil
	}

	entries, err := s.loadEntries(raceID)
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		return nil
	}

	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// prevFrontEnd / prevTailEnd track the arrival time of the last PB of the
	// previous trial for the front and tail runners. Used to enforce the
	// planning envelope: eff_start = max(trial.start_time, prev_arrival).
	var prevFrontEnd *time.Time
	var prevTailEnd *time.Time

	for _, tr := range trials {
		track, err := s.loadTrialTrack(tr.id)
		if err != nil {
			return err
		}

		effFrontStart, effTailStart := s.effectiveStarts(tr, prevFrontEnd, prevTailEnd)

		// Compute new prevFrontEnd / prevTailEnd from the last projected PB in
		// this trial (by dist_in_trial_m) so the next iteration can use them.
		newPrevFront := prevFrontEnd
		newPrevTail := prevTailEnd

		for _, e := range entries {
			existing, existingErr := s.getExistingTrialVS(tx, tr.id, e.vsID)
			if existingErr != nil && !errors.Is(existingErr, errNoRow) {
				return existingErr
			}

			if existingErr == nil && existing.source == "manual_exclude" {
				continue
			}

			var distM *float64
			var autoFirst, autoLast *string
			source := "auto"

			if len(track.Points) == 0 {
				// No GPX for this trial — only manual_include rows survive.
				if !(existingErr == nil && existing.source == "manual_include") {
					continue
				}
			}

			if len(track.Points) > 0 {
				proj := gpx.NearestOnTrack(track.Points, e.lat, e.lon)
				if proj.DistFromVS <= 50 {
					v := proj.CumDistM
					distM = &v

					if effFrontStart != nil && tr.frontPace > 0 {
						f := effFrontStart.Add(time.Duration(v/(tr.frontPace*1000.0/3600.0)) * time.Second).UTC().Format(time.RFC3339)
						autoFirst = &f
					}
					if effTailStart != nil && tr.tailPace > 0 {
						l := effTailStart.Add(time.Duration(v/(tr.tailPace*1000.0/3600.0)) * time.Second).UTC().Format(time.RFC3339)
						autoLast = &l
					}
				} else {
					// PB not within 50 m of this trial's track.
					if existingErr == nil && existing.source == "auto" {
						if err := s.deleteTrialVS(tx, tr.id, e.vsID); err != nil {
							return err
						}
					}
					if existingErr == nil && existing.source == "manual_include" {
						source = "manual_include"
					} else {
						continue
					}
				}
			}

			if existingErr == nil && existing.source == "manual_include" {
				source = "manual_include"
			}

			if err := s.upsertTrialVS(tx, tr.id, e.vsID, source, distM, autoFirst, autoLast); err != nil {
				return fmt.Errorf("recompute: upsert trial_vs trial=%d vs=%d: %w", tr.id, e.vsID, err)
			}

			// Track the timing of the last projected PB for envelope propagation.
			if distM != nil && autoFirst != nil {
				t, err := time.Parse(time.RFC3339, *autoFirst)
				if err == nil {
					if newPrevFront == nil || t.After(*newPrevFront) {
						tc := t
						newPrevFront = &tc
					}
				}
			}
			if distM != nil && autoLast != nil {
				t, err := time.Parse(time.RFC3339, *autoLast)
				if err == nil {
					if newPrevTail == nil || t.After(*newPrevTail) {
						tc := t
						newPrevTail = &tc
					}
				}
			}
		}

		prevFrontEnd = newPrevFront
		prevTailEnd = newPrevTail
	}

	return tx.Commit()
}

// effectiveStarts returns the effective front and tail start times for a trial,
// applying the planning envelope from the previous trial's last arrival.
func (s *Service) effectiveStarts(tr trialRow, prevFront, prevTail *time.Time) (*time.Time, *time.Time) {
	scheduled, hasScheduled := parseStart(tr.startTime)

	var effFront, effTail *time.Time
	if hasScheduled {
		t := scheduled
		effFront = &t
		t2 := scheduled
		effTail = &t2
	}
	if prevFront != nil {
		if effFront == nil || prevFront.After(*effFront) {
			t := *prevFront
			effFront = &t
		}
	}
	if prevTail != nil {
		if effTail == nil || prevTail.After(*effTail) {
			t := *prevTail
			effTail = &t
		}
	}
	return effFront, effTail
}

// RecomputeForVS recomputes every race that has a race_vs_entry for this VS.
// Called by the vs feature when a VS's lat/lon change.
func (s *Service) RecomputeForVS(vsID int64) error {
	rows, err := s.DB.Query(`SELECT DISTINCT race_id FROM race_vs_entries WHERE vs_id = ?`, vsID)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return err
		}
		ids = append(ids, id)
	}
	for _, id := range ids {
		if err := s.RecomputeRace(id); err != nil {
			return err
		}
	}
	return nil
}

type trialRow struct {
	id        int64
	sequence  int
	startTime *string
	frontPace float64
	tailPace  float64
}

type entryRow struct {
	id   int64
	vsID int64
	lat  float64
	lon  float64
}

type existingTrialVS struct {
	id     int64
	source string
}

var errNoRow = errors.New("no row")

func (s *Service) loadTrials(raceID int64) ([]trialRow, error) {
	rows, err := s.DB.Query(
		`SELECT id, sequence, start_time, front_pace, tail_pace FROM trials WHERE race_id = ? ORDER BY sequence`,
		raceID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []trialRow
	for rows.Next() {
		var tr trialRow
		if err := rows.Scan(&tr.id, &tr.sequence, &tr.startTime, &tr.frontPace, &tr.tailPace); err != nil {
			return nil, err
		}
		out = append(out, tr)
	}
	return out, rows.Err()
}

func (s *Service) loadEntries(raceID int64) ([]entryRow, error) {
	const q = `SELECT e.id, e.vs_id, v.lat, v.lon
	           FROM race_vs_entries e
	           JOIN vs v ON v.id = e.vs_id
	           WHERE e.race_id = ?
	           ORDER BY e.sequence`
	rows, err := s.DB.Query(q, raceID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []entryRow
	for rows.Next() {
		var e entryRow
		if err := rows.Scan(&e.id, &e.vsID, &e.lat, &e.lon); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Service) loadTrialTrack(trialID int64) (gpx.Track, error) {
	rows, err := s.DB.Query(
		`SELECT points, total_distance_m FROM gpx_files WHERE trial_id = ? ORDER BY id LIMIT 1`,
		trialID,
	)
	if err != nil {
		return gpx.Track{}, err
	}
	defer func() { _ = rows.Close() }()
	if !rows.Next() {
		return gpx.Track{}, rows.Err()
	}
	var pointsJSON string
	var total float64
	if err := rows.Scan(&pointsJSON, &total); err != nil {
		return gpx.Track{}, err
	}
	var points []gpx.Point
	if err := json.Unmarshal([]byte(pointsJSON), &points); err != nil {
		return gpx.Track{}, fmt.Errorf("recompute: gpx_files.points json: %w", err)
	}
	return gpx.Track{Points: points, TotalDistance: total}, nil
}

type txQuerier interface {
	QueryRow(query string, args ...any) *sql.Row
	Exec(query string, args ...any) (sql.Result, error)
}

func (s *Service) getExistingTrialVS(tx txQuerier, trialID, vsID int64) (existingTrialVS, error) {
	row := tx.QueryRow(`SELECT id, source FROM race_trial_vs WHERE trial_id = ? AND vs_id = ?`, trialID, vsID)
	var ev existingTrialVS
	if err := row.Scan(&ev.id, &ev.source); errors.Is(err, sql.ErrNoRows) {
		return existingTrialVS{}, errNoRow
	} else if err != nil {
		return existingTrialVS{}, err
	}
	return ev, nil
}

func (s *Service) deleteTrialVS(tx txQuerier, trialID, vsID int64) error {
	_, err := tx.Exec(`DELETE FROM race_trial_vs WHERE trial_id = ? AND vs_id = ?`, trialID, vsID)
	return err
}

func (s *Service) upsertTrialVS(tx txQuerier, trialID, vsID int64, source string, distM *float64, autoFirst, autoLast *string) error {
	const q = `INSERT INTO race_trial_vs (trial_id, vs_id, source, dist_in_trial_m, auto_first_in, auto_last_in)
	           VALUES (?, ?, ?, ?, ?, ?)
	           ON CONFLICT(trial_id, vs_id) DO UPDATE SET
	             source          = excluded.source,
	             dist_in_trial_m = excluded.dist_in_trial_m,
	             auto_first_in   = excluded.auto_first_in,
	             auto_last_in    = excluded.auto_last_in`
	_, err := tx.Exec(q, trialID, vsID, source, distM, autoFirst, autoLast)
	return err
}

// parseStart accepts the few datetime formats SQLite returns.
func parseStart(s *string) (time.Time, bool) {
	if s == nil || *s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04:05", "2006-01-02T15:04", "2006-01-02"} {
		if t, err := time.Parse(layout, *s); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}
