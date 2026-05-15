package race

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/guillaumetavernier/volunteersmanager/internal/gpx"
)

// Service owns recompute side-effects across races, gpx_files, vs and
// race_vs_entries. It is the single place that turns "something moved" into
// updated projected_dist_m / auto_first_in / auto_last_in values.
type Service struct {
	DB *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{DB: db} }

// RecomputeRace projects every race_vs_entry of the given race against the
// concatenated polyline of its gpx_files and fills auto_first_in / auto_last_in
// from the race paces. Manual values are not touched.
func (s *Service) RecomputeRace(raceID int64) error {
	ra, err := (&Store{DB: s.DB}).Get(raceID)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}

	track, err := s.loadTrack(raceID)
	if err != nil {
		return err
	}
	entries, err := s.loadEntries(raceID)
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		return nil
	}

	startTime, hasStart := parseStart(ra.StartTime)

	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	for _, e := range entries {
		var projectedM *float64
		var autoFirst, autoLast *string
		if len(track.Points) > 0 {
			proj := gpx.NearestOnTrack(track.Points, e.lat, e.lon)
			v := proj.CumDistM
			projectedM = &v
			if hasStart {
				f := startTime.Add(time.Duration(v/(ra.FrontPace*1000.0/3600.0)) * time.Second).UTC().Format(time.RFC3339)
				l := startTime.Add(time.Duration(v/(ra.TailPace*1000.0/3600.0)) * time.Second).UTC().Format(time.RFC3339)
				autoFirst = &f
				autoLast = &l
			}
		}
		if _, err := tx.Exec(
			`UPDATE race_vs_entries SET projected_dist_m = ?, auto_first_in = ?, auto_last_in = ? WHERE id = ?`,
			projectedM, autoFirst, autoLast, e.id,
		); err != nil {
			return fmt.Errorf("recompute: update entry %d: %w", e.id, err)
		}
	}
	return tx.Commit()
}

// RecomputeForVS recomputes every race that has a race_vs_entry for this VS.
// Called by the vs feature when a VS's lat/lon change.
func (s *Service) RecomputeForVS(vsID int64) error {
	rows, err := s.DB.Query(`SELECT DISTINCT race_id FROM race_vs_entries WHERE vs_id = ?`, vsID)
	if err != nil {
		return err
	}
	defer rows.Close()
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

type entryRow struct {
	id   int64
	vsID int64
	lat  float64
	lon  float64
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
	defer rows.Close()
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

func (s *Service) loadTrack(raceID int64) (gpx.Track, error) {
	rows, err := s.DB.Query(`SELECT points, total_distance_m FROM gpx_files WHERE race_id = ? ORDER BY id`, raceID)
	if err != nil {
		return gpx.Track{}, err
	}
	defer rows.Close()
	var tracks []gpx.Track
	for rows.Next() {
		var pointsJSON string
		var total float64
		if err := rows.Scan(&pointsJSON, &total); err != nil {
			return gpx.Track{}, err
		}
		var points []gpx.Point
		if err := json.Unmarshal([]byte(pointsJSON), &points); err != nil {
			return gpx.Track{}, fmt.Errorf("recompute: gpx_files.points json: %w", err)
		}
		tracks = append(tracks, gpx.Track{Points: points, TotalDistance: total})
	}
	return gpx.Merge(tracks), nil
}

// parseStart accepts the few datetime formats SQLite returns from DEFAULT-style
// columns and the RFC3339 we emit ourselves.
func parseStart(s *string) (time.Time, bool) {
	if s == nil || *s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, *s); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}
