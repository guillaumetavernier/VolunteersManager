package vs

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrNotFound      = errors.New("vs: not found")
	ErrDuplicateName = errors.New("vs: duplicate name")
)

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

func (s *Store) List() ([]VS, error) {
	const q = `SELECT id, name, lat, lon, notes, photo_path, what3words, created_at, updated_at
	           FROM vs ORDER BY name COLLATE NOCASE`
	rows, err := s.DB.Query(q)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []VS
	for rows.Next() {
		v, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *Store) Get(id int64) (VS, error) {
	const q = `SELECT id, name, lat, lon, notes, photo_path, what3words, created_at, updated_at
	           FROM vs WHERE id = ?`
	row := s.DB.QueryRow(q, id)
	v, err := scanRow(row)
	if errors.Is(err, sql.ErrNoRows) {
		return VS{}, ErrNotFound
	}
	return v, err
}

func (s *Store) Create(name string, lat, lon float64, notes, what3words *string) (VS, error) {
	const q = `INSERT INTO vs (name, lat, lon, notes, what3words) VALUES (?, ?, ?, ?, ?)`
	res, err := s.DB.Exec(q, name, lat, lon, notes, what3words)
	if err != nil {
		if isUniqueViolation(err) {
			return VS{}, ErrDuplicateName
		}
		return VS{}, err
	}
	id, _ := res.LastInsertId()
	return s.Get(id)
}

// Patch applies the non-nil fields of p to the row. Returns ErrNotFound if no
// such VS, ErrDuplicateName if Name collides with another row.
func (s *Store) Patch(id int64, p Patch) (VS, error) {
	sets := []string{}
	args := []any{}
	if p.Name != nil {
		sets = append(sets, "name = ?")
		args = append(args, *p.Name)
	}
	if p.Lat != nil {
		sets = append(sets, "lat = ?")
		args = append(args, *p.Lat)
	}
	if p.Lon != nil {
		sets = append(sets, "lon = ?")
		args = append(args, *p.Lon)
	}
	if p.Notes != nil {
		sets = append(sets, "notes = ?")
		args = append(args, *p.Notes)
	}
	if p.What3Words != nil {
		sets = append(sets, "what3words = ?")
		args = append(args, *p.What3Words)
	}
	if len(sets) == 0 {
		return s.Get(id)
	}
	sets = append(sets, "updated_at = datetime('now')")
	q := fmt.Sprintf("UPDATE vs SET %s WHERE id = ?", strings.Join(sets, ", "))
	args = append(args, id)
	res, err := s.DB.Exec(q, args...)
	if err != nil {
		if isUniqueViolation(err) {
			return VS{}, ErrDuplicateName
		}
		return VS{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return VS{}, ErrNotFound
	}
	return s.Get(id)
}

func (s *Store) SetPhotoPath(id int64, photoPath string) (VS, error) {
	res, err := s.DB.Exec(`UPDATE vs SET photo_path = ?, updated_at = datetime('now') WHERE id = ?`, photoPath, id)
	if err != nil {
		return VS{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return VS{}, ErrNotFound
	}
	return s.Get(id)
}

func (s *Store) Delete(id int64) error {
	res, err := s.DB.Exec(`DELETE FROM vs WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanRow(r rowScanner) (VS, error) {
	var v VS
	err := r.Scan(&v.ID, &v.Name, &v.Lat, &v.Lon, &v.Notes, &v.PhotoPath, &v.What3Words, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE")
}
