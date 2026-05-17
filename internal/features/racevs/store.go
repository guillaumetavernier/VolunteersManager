package racevs

import (
	"database/sql"
	"errors"
)

var ErrNotFound = errors.New("racevs: not found")

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

func (s *Store) List(raceID int64) ([]Entry, error) {
	const q = `
		SELECT e.id, e.race_id, e.vs_id, e.sequence,
		       MIN(rtv.dist_in_trial_m) AS projected_dist_m,
		       MIN(COALESCE(rtv.manual_first_in, rtv.auto_first_in)) AS earliest_first_in,
		       MAX(COALESCE(rtv.manual_last_in, rtv.auto_last_in))  AS latest_last_in
		FROM race_vs_entries e
		LEFT JOIN trials t ON t.race_id = e.race_id
		LEFT JOIN race_trial_vs rtv ON rtv.trial_id = t.id AND rtv.vs_id = e.vs_id
		         AND rtv.source != 'manual_exclude'
		WHERE e.race_id = ?
		GROUP BY e.id, e.race_id, e.vs_id, e.sequence
		ORDER BY e.sequence`
	rows, err := s.DB.Query(q, raceID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []Entry
	for rows.Next() {
		e, err := scanEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// Replace overwrites the whole ordered list for a race.
func (s *Store) Replace(raceID int64, items []PutOrderItem) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec(`DELETE FROM race_vs_entries WHERE race_id = ?`, raceID); err != nil {
		return err
	}
	for _, it := range items {
		if _, err := tx.Exec(
			`INSERT INTO race_vs_entries (race_id, vs_id, sequence) VALUES (?, ?, ?)`,
			raceID, it.VSID, it.Sequence,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

type rowScanner interface{ Scan(dest ...any) error }

func scanEntry(r rowScanner) (Entry, error) {
	var e Entry
	err := r.Scan(&e.ID, &e.RaceID, &e.VSID, &e.Sequence, &e.ProjectedDistM, &e.EarliestFirstIn, &e.LatestLastIn)
	return e, err
}
