package trial

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrNotFound  = errors.New("trial: not found")
	ErrNotInRace = errors.New("trial: gpx_file does not belong to this trial")
)

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

const trialCols = `id, race_id, sequence, name, start_time, front_pace, tail_pace, created_at, updated_at`

func (s *Store) List(raceID int64) ([]Trial, error) {
	rows, err := s.DB.Query(`SELECT `+trialCols+` FROM trials WHERE race_id = ? ORDER BY sequence`, raceID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []Trial
	for rows.Next() {
		tr, err := scanTrial(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, tr)
	}
	return out, rows.Err()
}

func (s *Store) Get(id int64) (Trial, error) {
	row := s.DB.QueryRow(`SELECT `+trialCols+` FROM trials WHERE id = ?`, id)
	tr, err := scanTrial(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Trial{}, ErrNotFound
	}
	return tr, err
}

type CreateInput struct {
	RaceID    int64
	Sequence  int
	Name      string
	StartTime *string
	FrontPace float64
	TailPace  float64
}

func (s *Store) Create(inp CreateInput) (Trial, error) {
	const q = `INSERT INTO trials (race_id, sequence, name, start_time, front_pace, tail_pace) VALUES (?, ?, ?, ?, ?, ?)`
	res, err := s.DB.Exec(q, inp.RaceID, inp.Sequence, inp.Name, inp.StartTime, inp.FrontPace, inp.TailPace)
	if err != nil {
		return Trial{}, err
	}
	id, _ := res.LastInsertId()
	return s.Get(id)
}

type PatchInput struct {
	Name      *string
	StartTime *string
	FrontPace *float64
	TailPace  *float64
}

func (s *Store) Patch(id int64, p PatchInput) (Trial, error) {
	sets := []string{}
	args := []any{}
	if p.Name != nil {
		sets = append(sets, "name = ?")
		args = append(args, *p.Name)
	}
	if p.StartTime != nil {
		sets = append(sets, "start_time = ?")
		args = append(args, *p.StartTime)
	}
	if p.FrontPace != nil {
		sets = append(sets, "front_pace = ?")
		args = append(args, *p.FrontPace)
	}
	if p.TailPace != nil {
		sets = append(sets, "tail_pace = ?")
		args = append(args, *p.TailPace)
	}
	if len(sets) == 0 {
		return s.Get(id)
	}
	sets = append(sets, "updated_at = datetime('now')")
	q := fmt.Sprintf("UPDATE trials SET %s WHERE id = ?", strings.Join(sets, ", "))
	args = append(args, id)
	res, err := s.DB.Exec(q, args...)
	if err != nil {
		return Trial{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Trial{}, ErrNotFound
	}
	return s.Get(id)
}

func (s *Store) Delete(id int64) (int64, error) {
	tr, err := s.Get(id)
	if errors.Is(err, ErrNotFound) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	if _, err := s.DB.Exec(`DELETE FROM trials WHERE id = ?`, id); err != nil {
		return 0, err
	}
	return tr.RaceID, nil
}

// Reorder updates sequence values for a set of trials in a single transaction.
// To avoid UNIQUE(race_id, sequence) violations during the swap, we first set
// all sequences to large temp values, then apply the real ones.
func (s *Store) Reorder(items []ReorderItem) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	// Phase 1: move to large temp sequences to avoid transient conflicts.
	for i, it := range items {
		tmp := 100000 + i
		if _, err := tx.Exec(`UPDATE trials SET sequence = ? WHERE id = ?`, tmp, it.TrialID); err != nil {
			return fmt.Errorf("reorder temp trial %d: %w", it.TrialID, err)
		}
	}
	// Phase 2: set real sequences.
	for _, it := range items {
		if _, err := tx.Exec(`UPDATE trials SET sequence = ?, updated_at = datetime('now') WHERE id = ?`, it.Sequence, it.TrialID); err != nil {
			return fmt.Errorf("reorder trial %d: %w", it.TrialID, err)
		}
	}
	return tx.Commit()
}

// CreateGPX inserts a gpx_files row bound to a trial.
func (s *Store) CreateGPX(raceID int64, trialID int64, filePath, pointsJSON string, totalDistanceM float64) (GPXFile, error) {
	const q = `INSERT INTO gpx_files (race_id, trial_id, file_path, points, total_distance_m) VALUES (?, ?, ?, ?, ?)`
	res, err := s.DB.Exec(q, raceID, trialID, filePath, pointsJSON, totalDistanceM)
	if err != nil {
		return GPXFile{}, err
	}
	id, _ := res.LastInsertId()
	return s.GetGPX(id)
}

func (s *Store) GetGPX(id int64) (GPXFile, error) {
	row := s.DB.QueryRow(`SELECT id, race_id, trial_id, file_path, total_distance_m, created_at FROM gpx_files WHERE id = ?`, id)
	g, err := scanGPX(row)
	if errors.Is(err, sql.ErrNoRows) {
		return GPXFile{}, ErrNotFound
	}
	return g, err
}

func (s *Store) ListGPXByTrial(trialID int64) ([]GPXFile, error) {
	rows, err := s.DB.Query(`SELECT id, race_id, trial_id, file_path, total_distance_m, created_at FROM gpx_files WHERE trial_id = ? ORDER BY id`, trialID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []GPXFile
	for rows.Next() {
		g, err := scanGPX(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (s *Store) DeleteGPX(trialID, gpxID int64) error {
	res, err := s.DB.Exec(`DELETE FROM gpx_files WHERE id = ? AND trial_id = ?`, gpxID, trialID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// GetTrialVS returns one race_trial_vs row by ID.
func (s *Store) GetTrialVS(id int64) (TrialVS, error) {
	const q = `SELECT id, trial_id, vs_id, source, dist_in_trial_m, auto_first_in, auto_last_in, manual_first_in, manual_last_in FROM race_trial_vs WHERE id = ?`
	row := s.DB.QueryRow(q, id)
	tv, err := scanTrialVS(row)
	if errors.Is(err, sql.ErrNoRows) {
		return TrialVS{}, ErrNotFound
	}
	return tv, err
}

// PatchTrialVSRow updates source and/or manual times on a race_trial_vs row.
func (s *Store) PatchTrialVSRow(id int64, p PatchTrialVS) (TrialVS, error) {
	sets := []string{}
	args := []any{}
	if p.Source != nil {
		sets = append(sets, "source = ?")
		args = append(args, *p.Source)
	}
	if p.ManualFirstIn != nil {
		sets = append(sets, "manual_first_in = ?")
		args = append(args, *p.ManualFirstIn)
	}
	if p.ManualLastIn != nil {
		sets = append(sets, "manual_last_in = ?")
		args = append(args, *p.ManualLastIn)
	}
	if len(sets) == 0 {
		return s.GetTrialVS(id)
	}
	q := fmt.Sprintf("UPDATE race_trial_vs SET %s WHERE id = ?", strings.Join(sets, ", "))
	args = append(args, id)
	res, err := s.DB.Exec(q, args...)
	if err != nil {
		return TrialVS{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return TrialVS{}, ErrNotFound
	}
	return s.GetTrialVS(id)
}

type rowScanner interface{ Scan(dest ...any) error }

func scanTrial(r rowScanner) (Trial, error) {
	var tr Trial
	err := r.Scan(&tr.ID, &tr.RaceID, &tr.Sequence, &tr.Name, &tr.StartTime, &tr.FrontPace, &tr.TailPace, &tr.CreatedAt, &tr.UpdatedAt)
	return tr, err
}

func scanGPX(r rowScanner) (GPXFile, error) {
	var g GPXFile
	err := r.Scan(&g.ID, &g.RaceID, &g.TrialID, &g.FilePath, &g.TotalDistanceM, &g.CreatedAt)
	return g, err
}

func scanTrialVS(r rowScanner) (TrialVS, error) {
	var tv TrialVS
	err := r.Scan(&tv.ID, &tv.TrialID, &tv.VSID, &tv.Source, &tv.DistInTrialM, &tv.AutoFirstIn, &tv.AutoLastIn, &tv.ManualFirstIn, &tv.ManualLastIn)
	return tv, err
}
