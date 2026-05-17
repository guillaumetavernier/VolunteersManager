package race

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrNotFound      = errors.New("race: not found")
	ErrDuplicateName = errors.New("race: duplicate name")
)

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

const raceCols = `id, name, color, created_at, updated_at`

func (s *Store) List() ([]Race, error) {
	rows, err := s.DB.Query(`SELECT ` + raceCols + ` FROM races ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []Race
	for rows.Next() {
		r, err := scanRace(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) Get(id int64) (Race, error) {
	row := s.DB.QueryRow(`SELECT `+raceCols+` FROM races WHERE id = ?`, id)
	r, err := scanRace(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Race{}, ErrNotFound
	}
	return r, err
}

func (s *Store) Create(name, color string) (Race, error) {
	const q = `INSERT INTO races (name, color) VALUES (?, ?)`
	res, err := s.DB.Exec(q, name, color)
	if err != nil {
		if isUniqueViolation(err) {
			return Race{}, ErrDuplicateName
		}
		return Race{}, err
	}
	id, _ := res.LastInsertId()
	return s.Get(id)
}

func (s *Store) Patch(id int64, p Patch) (Race, error) {
	sets := []string{}
	args := []any{}
	if p.Name != nil {
		sets = append(sets, "name = ?")
		args = append(args, *p.Name)
	}
	if p.Color != nil {
		sets = append(sets, "color = ?")
		args = append(args, *p.Color)
	}
	if len(sets) == 0 {
		return s.Get(id)
	}
	sets = append(sets, "updated_at = datetime('now')")
	q := fmt.Sprintf("UPDATE races SET %s WHERE id = ?", strings.Join(sets, ", "))
	args = append(args, id)
	res, err := s.DB.Exec(q, args...)
	if err != nil {
		if isUniqueViolation(err) {
			return Race{}, ErrDuplicateName
		}
		return Race{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Race{}, ErrNotFound
	}
	return s.Get(id)
}

func (s *Store) Delete(id int64) error {
	res, err := s.DB.Exec(`DELETE FROM races WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListGPX(raceID int64) ([]GPXFile, error) {
	rows, err := s.DB.Query(`SELECT id, race_id, trial_id, file_path, points, total_distance_m, created_at FROM gpx_files WHERE race_id = ? ORDER BY id`, raceID)
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

func (s *Store) GetGPX(id int64) (GPXFile, error) {
	row := s.DB.QueryRow(`SELECT id, race_id, trial_id, file_path, points, total_distance_m, created_at FROM gpx_files WHERE id = ?`, id)
	g, err := scanGPX(row)
	if errors.Is(err, sql.ErrNoRows) {
		return GPXFile{}, ErrNotFound
	}
	return g, err
}

type rowScanner interface{ Scan(dest ...any) error }

func scanRace(r rowScanner) (Race, error) {
	var ra Race
	err := r.Scan(&ra.ID, &ra.Name, &ra.Color, &ra.CreatedAt, &ra.UpdatedAt)
	return ra, err
}

func scanGPX(r rowScanner) (GPXFile, error) {
	var g GPXFile
	err := r.Scan(&g.ID, &g.RaceID, &g.TrialID, &g.FilePath, &g.Points, &g.TotalDistanceM, &g.CreatedAt)
	return g, err
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE")
}
