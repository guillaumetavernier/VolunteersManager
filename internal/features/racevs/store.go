package racevs

import (
	"database/sql"
	"errors"
)

var ErrNotFound = errors.New("racevs: not found")

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

const entryCols = `id, race_id, vs_id, sequence, projected_dist_m, auto_first_in, auto_last_in, manual_first_in, manual_last_in`

func (s *Store) List(raceID int64) ([]Entry, error) {
	rows, err := s.DB.Query(`SELECT `+entryCols+` FROM race_vs_entries WHERE race_id = ? ORDER BY sequence`, raceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
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

type savedManualTimes struct {
	manualFirstIn *string
	manualLastIn  *string
}

// Replace overwrites the whole ordered list for a race. Manual override times
// are preserved across calls — they survive add/remove/reorder of any other VS.
func (s *Store) Replace(raceID int64, items []PutOrderItem) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	rows, err := tx.Query(`SELECT vs_id, manual_first_in, manual_last_in FROM race_vs_entries WHERE race_id = ?`, raceID)
	if err != nil {
		return err
	}
	saved := map[int64]savedManualTimes{}
	for rows.Next() {
		var vsID int64
		var mf, ml *string
		if err := rows.Scan(&vsID, &mf, &ml); err != nil {
			rows.Close()
			return err
		}
		saved[vsID] = savedManualTimes{manualFirstIn: mf, manualLastIn: ml}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	if _, err := tx.Exec(`DELETE FROM race_vs_entries WHERE race_id = ?`, raceID); err != nil {
		return err
	}
	for _, it := range items {
		s := saved[it.VSID]
		if _, err := tx.Exec(
			`INSERT INTO race_vs_entries (race_id, vs_id, sequence, manual_first_in, manual_last_in) VALUES (?, ?, ?, ?, ?)`,
			raceID, it.VSID, it.Sequence, s.manualFirstIn, s.manualLastIn,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) PatchTimes(raceID, vsID int64, p PatchTimes) (Entry, error) {
	const q = `UPDATE race_vs_entries SET manual_first_in = COALESCE(?, manual_first_in), manual_last_in = COALESCE(?, manual_last_in) WHERE race_id = ? AND vs_id = ?`
	res, err := s.DB.Exec(q, p.ManualFirstIn, p.ManualLastIn, raceID, vsID)
	if err != nil {
		return Entry{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Entry{}, ErrNotFound
	}
	return s.GetByVS(raceID, vsID)
}

// ClearManual lets the UI explicitly null out an override (since COALESCE-based
// PatchTimes can't carry "set to null").
func (s *Store) ClearManual(raceID, vsID int64, first, last bool) (Entry, error) {
	if !first && !last {
		return s.GetByVS(raceID, vsID)
	}
	sets := ""
	switch {
	case first && last:
		sets = "manual_first_in = NULL, manual_last_in = NULL"
	case first:
		sets = "manual_first_in = NULL"
	case last:
		sets = "manual_last_in = NULL"
	}
	res, err := s.DB.Exec(`UPDATE race_vs_entries SET `+sets+` WHERE race_id = ? AND vs_id = ?`, raceID, vsID)
	if err != nil {
		return Entry{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Entry{}, ErrNotFound
	}
	return s.GetByVS(raceID, vsID)
}

func (s *Store) GetByVS(raceID, vsID int64) (Entry, error) {
	row := s.DB.QueryRow(`SELECT `+entryCols+` FROM race_vs_entries WHERE race_id = ? AND vs_id = ?`, raceID, vsID)
	e, err := scanEntry(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Entry{}, ErrNotFound
	}
	return e, err
}

type rowScanner interface{ Scan(dest ...any) error }

func scanEntry(r rowScanner) (Entry, error) {
	var e Entry
	err := r.Scan(&e.ID, &e.RaceID, &e.VSID, &e.Sequence, &e.ProjectedDistM, &e.AutoFirstIn, &e.AutoLastIn, &e.ManualFirstIn, &e.ManualLastIn)
	return e, err
}
