package mission

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var ErrNotFound = errors.New("mission: not found")

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

const baseCols = `m.id, m.vs_id, m.day, m.start_time, m.end_time, m.role_type,
		m.headcount, m.title, m.description, m.tagged_race_ids,
		m.created_at, m.updated_at,
		(SELECT COUNT(*) FROM assignments a WHERE a.mission_id = m.id) AS assigned`

func (s *Store) List(f Filter) ([]Mission, error) {
	q := `SELECT ` + baseCols + ` FROM missions m WHERE 1=1`
	args := []any{}
	if f.VSID != nil {
		q += ` AND m.vs_id = ?`
		args = append(args, *f.VSID)
	}
	if f.Day != nil {
		q += ` AND m.day = ?`
		args = append(args, *f.Day)
	}
	if f.Role != nil && *f.Role != "" {
		q += ` AND lower(m.role_type) = lower(?)`
		args = append(args, *f.Role)
	}
	q += ` ORDER BY m.day, m.start_time, m.id`
	rows, err := s.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []Mission
	for rows.Next() {
		m, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		if f.Race != nil {
			found := false
			for _, id := range m.TaggedRaceIDs {
				if id == *f.Race {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) Get(id int64) (Mission, error) {
	row := s.DB.QueryRow(`SELECT `+baseCols+` FROM missions m WHERE m.id = ?`, id)
	m, err := scanRow(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Mission{}, ErrNotFound
	}
	return m, err
}

func (s *Store) Create(in Input) (Mission, error) {
	tagsJSON, err := encodeIDs(in.TaggedRaceIDs)
	if err != nil {
		return Mission{}, err
	}
	headcount := in.Headcount
	if headcount < 1 {
		headcount = 1
	}
	const q = `INSERT INTO missions (vs_id, day, start_time, end_time, role_type, headcount, title, description, tagged_race_ids)
	           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	res, err := s.DB.Exec(q, in.VSID, in.Day, in.StartTime, in.EndTime, in.RoleType, headcount, in.Title, in.Description, tagsJSON)
	if err != nil {
		return Mission{}, err
	}
	id, _ := res.LastInsertId()
	return s.Get(id)
}

func (s *Store) Patch(id int64, p Patch) (Mission, error) {
	sets := []string{}
	args := []any{}
	if p.Day != nil {
		sets = append(sets, "day = ?")
		args = append(args, *p.Day)
	}
	if p.StartTime != nil {
		sets = append(sets, "start_time = ?")
		args = append(args, *p.StartTime)
	}
	if p.EndTime != nil {
		sets = append(sets, "end_time = ?")
		args = append(args, *p.EndTime)
	}
	if p.RoleType != nil {
		sets = append(sets, "role_type = ?")
		args = append(args, *p.RoleType)
	}
	if p.Headcount != nil {
		hc := *p.Headcount
		if hc < 1 {
			hc = 1
		}
		sets = append(sets, "headcount = ?")
		args = append(args, hc)
	}
	if p.Title != nil {
		sets = append(sets, "title = ?")
		args = append(args, *p.Title)
	}
	if p.Description != nil {
		sets = append(sets, "description = ?")
		args = append(args, *p.Description)
	}
	if p.TaggedRaceIDs != nil {
		j, err := encodeIDs(*p.TaggedRaceIDs)
		if err != nil {
			return Mission{}, err
		}
		sets = append(sets, "tagged_race_ids = ?")
		args = append(args, j)
	}
	if len(sets) == 0 {
		return s.Get(id)
	}
	sets = append(sets, "updated_at = datetime('now')")
	q := fmt.Sprintf("UPDATE missions SET %s WHERE id = ?", strings.Join(sets, ", "))
	args = append(args, id)
	res, err := s.DB.Exec(q, args...)
	if err != nil {
		return Mission{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Mission{}, ErrNotFound
	}
	return s.Get(id)
}

func (s *Store) Delete(id int64) error {
	res, err := s.DB.Exec(`DELETE FROM missions WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// CountByVS returns the number of missions associated with a given VS.
func (s *Store) CountByVS(vsID int64) (int, error) {
	var n int
	err := s.DB.QueryRow(`SELECT COUNT(*) FROM missions WHERE vs_id = ?`, vsID).Scan(&n)
	return n, err
}

// CountAssignmentsByVS counts assignments whose mission is anchored at this VS.
func (s *Store) CountAssignmentsByVS(vsID int64) (int, error) {
	var n int
	err := s.DB.QueryRow(`SELECT COUNT(*) FROM assignments a
			JOIN missions m ON m.id = a.mission_id
			WHERE m.vs_id = ?`, vsID).Scan(&n)
	return n, err
}

// ScrubRaceTag walks every mission and removes raceID from its
// tagged_race_ids JSON array. Best-effort: orphan IDs are non-fatal.
func (s *Store) ScrubRaceTag(raceID int64) error {
	rows, err := s.DB.Query(`SELECT id, tagged_race_ids FROM missions`)
	if err != nil {
		return err
	}
	type pending struct {
		id   int64
		tags []int64
	}
	var updates []pending
	for rows.Next() {
		var id int64
		var raw string
		if err := rows.Scan(&id, &raw); err != nil {
			_ = rows.Close()
			return err
		}
		var ids []int64
		if raw != "" {
			_ = json.Unmarshal([]byte(raw), &ids)
		}
		filtered := ids[:0]
		changed := false
		for _, t := range ids {
			if t == raceID {
				changed = true
				continue
			}
			filtered = append(filtered, t)
		}
		if changed {
			updates = append(updates, pending{id: id, tags: filtered})
		}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	_ = rows.Close()
	for _, u := range updates {
		j, err := encodeIDs(u.tags)
		if err != nil {
			return err
		}
		if _, err := s.DB.Exec(`UPDATE missions SET tagged_race_ids = ?, updated_at = datetime('now') WHERE id = ?`, j, u.id); err != nil {
			return err
		}
	}
	return nil
}

type rowScanner interface{ Scan(dest ...any) error }

func scanRow(r rowScanner) (Mission, error) {
	var m Mission
	var tagsRaw string
	err := r.Scan(&m.ID, &m.VSID, &m.Day, &m.StartTime, &m.EndTime, &m.RoleType,
		&m.Headcount, &m.Title, &m.Description, &tagsRaw,
		&m.CreatedAt, &m.UpdatedAt, &m.Assigned)
	if err != nil {
		return Mission{}, err
	}
	if tagsRaw != "" {
		_ = json.Unmarshal([]byte(tagsRaw), &m.TaggedRaceIDs)
	}
	if m.TaggedRaceIDs == nil {
		m.TaggedRaceIDs = []int64{}
	}
	m.Needed = m.Headcount
	m.Status = staffingStatus(m.Assigned, m.Headcount)
	return m, nil
}

func staffingStatus(assigned, needed int) string {
	switch {
	case assigned < needed:
		return "under"
	case assigned == needed:
		return "exact"
	default:
		return "over"
	}
}

func encodeIDs(xs []int64) (string, error) {
	if xs == nil {
		xs = []int64{}
	}
	b, err := json.Marshal(xs)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
