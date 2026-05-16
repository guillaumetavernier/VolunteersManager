package car

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrNotFound      = errors.New("car: not found")
	ErrDuplicateName = errors.New("car: duplicate name")
	ErrDriverInvalid = errors.New("car: default driver must be can_drive=1")
)

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

const baseColumns = `id, name, seats, default_driver_id, notes, created_at, updated_at`

func (s *Store) List() ([]Car, error) {
	q := fmt.Sprintf(`SELECT %s FROM cars ORDER BY name COLLATE NOCASE`, baseColumns)
	rows, err := s.DB.Query(q)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []Car
	for rows.Next() {
		c, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) Get(id int64) (Car, error) {
	q := fmt.Sprintf(`SELECT %s FROM cars WHERE id = ?`, baseColumns)
	row := s.DB.QueryRow(q, id)
	c, err := scanRow(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Car{}, ErrNotFound
	}
	return c, err
}

func (s *Store) Create(in Input) (Car, error) {
	if in.DefaultDriverID != nil {
		if ok, err := s.driverIsValid(*in.DefaultDriverID); err != nil {
			return Car{}, err
		} else if !ok {
			return Car{}, ErrDriverInvalid
		}
	}
	const q = `INSERT INTO cars (name, seats, default_driver_id, notes) VALUES (?, ?, ?, ?)`
	res, err := s.DB.Exec(q, in.Name, in.Seats, in.DefaultDriverID, in.Notes)
	if err != nil {
		if isUniqueViolation(err) {
			return Car{}, ErrDuplicateName
		}
		return Car{}, err
	}
	id, _ := res.LastInsertId()
	return s.Get(id)
}

func (s *Store) Patch(id int64, p Patch) (Car, error) {
	sets := []string{}
	args := []any{}
	if p.Name != nil {
		sets = append(sets, "name = ?")
		args = append(args, *p.Name)
	}
	if p.Seats != nil {
		sets = append(sets, "seats = ?")
		args = append(args, *p.Seats)
	}
	if p.DefaultDriverID != nil {
		if *p.DefaultDriverID > 0 {
			ok, err := s.driverIsValid(*p.DefaultDriverID)
			if err != nil {
				return Car{}, err
			}
			if !ok {
				return Car{}, ErrDriverInvalid
			}
		}
		sets = append(sets, "default_driver_id = ?")
		if *p.DefaultDriverID == 0 {
			args = append(args, nil)
		} else {
			args = append(args, *p.DefaultDriverID)
		}
	}
	if p.Notes != nil {
		sets = append(sets, "notes = ?")
		args = append(args, *p.Notes)
	}
	if len(sets) == 0 {
		return s.Get(id)
	}
	sets = append(sets, "updated_at = datetime('now')")
	q := fmt.Sprintf("UPDATE cars SET %s WHERE id = ?", strings.Join(sets, ", "))
	args = append(args, id)
	res, err := s.DB.Exec(q, args...)
	if err != nil {
		if isUniqueViolation(err) {
			return Car{}, ErrDuplicateName
		}
		return Car{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Car{}, ErrNotFound
	}
	return s.Get(id)
}

func (s *Store) Delete(id int64) error {
	res, err := s.DB.Exec(`DELETE FROM cars WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) driverIsValid(volunteerID int64) (bool, error) {
	var canDrive int
	err := s.DB.QueryRow(`SELECT can_drive FROM volunteers WHERE id = ? AND archived = 0`, volunteerID).Scan(&canDrive)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return canDrive == 1, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanRow(r rowScanner) (Car, error) {
	var c Car
	err := r.Scan(&c.ID, &c.Name, &c.Seats, &c.DefaultDriverID, &c.Notes, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE")
}
