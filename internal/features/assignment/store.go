package assignment

import (
	"database/sql"
	"errors"
	"strings"
)

var (
	ErrNotFound  = errors.New("assignment: not found")
	ErrDuplicate = errors.New("assignment: duplicate")
)

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

const cols = `id, mission_id, volunteer_id, created_at`

func (s *Store) Create(in Input) (Assignment, error) {
	res, err := s.DB.Exec(`INSERT INTO assignments (mission_id, volunteer_id) VALUES (?, ?)`, in.MissionID, in.VolunteerID)
	if err != nil {
		if isUniqueViolation(err) {
			return Assignment{}, ErrDuplicate
		}
		return Assignment{}, err
	}
	id, _ := res.LastInsertId()
	return s.Get(id)
}

func (s *Store) Get(id int64) (Assignment, error) {
	row := s.DB.QueryRow(`SELECT `+cols+` FROM assignments WHERE id = ?`, id)
	a, err := scanRow(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Assignment{}, ErrNotFound
	}
	return a, err
}

func (s *Store) Delete(id int64) error {
	res, err := s.DB.Exec(`DELETE FROM assignments WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) DeletePair(volunteerID, missionID int64) error {
	res, err := s.DB.Exec(`DELETE FROM assignments WHERE volunteer_id = ? AND mission_id = ?`, volunteerID, missionID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListForVolunteer(volunteerID int64) ([]Assignment, error) {
	rows, err := s.DB.Query(`SELECT `+cols+` FROM assignments WHERE volunteer_id = ? ORDER BY created_at, id`, volunteerID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []Assignment
	for rows.Next() {
		a, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) ListForMission(missionID int64) ([]Assignment, error) {
	rows, err := s.DB.Query(`SELECT `+cols+` FROM assignments WHERE mission_id = ? ORDER BY created_at, id`, missionID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []Assignment
	for rows.Next() {
		a, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

type rowScanner interface{ Scan(dest ...any) error }

func scanRow(r rowScanner) (Assignment, error) {
	var a Assignment
	err := r.Scan(&a.ID, &a.MissionID, &a.VolunteerID, &a.CreatedAt)
	return a, err
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE")
}
