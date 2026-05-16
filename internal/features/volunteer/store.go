package volunteer

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrNotFound = errors.New("volunteer: not found")
)

// CarDependent describes a car that names the volunteer as its default driver.
type CarDependent struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// Dependents lists rows that block a hard delete.
type Dependents struct {
	Cars  []CarDependent `json:"cars"`
	Trips []int64        `json:"trips,omitempty"`
}

// ErrHasDependents is returned when a hard delete would orphan related rows.
type ErrHasDependents struct {
	Dependents Dependents
}

func (e *ErrHasDependents) Error() string { return "volunteer: has dependents" }

type Filter struct {
	// Archived controls which rows are returned: "false" (default), "true",
	// "all". Anything else is treated as the default.
	Archived string
}

type Store struct{ DB *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{DB: db} }

const baseColumns = `id, first_name, last_name, phone, email,
		emergency_contact_name, emergency_contact_phone,
		general_info, customizable_message, role_types, availability,
		default_vs_id, can_drive, license_type, notes, archived,
		created_at, updated_at`

func (s *Store) List(f Filter) ([]Volunteer, error) {
	where := "WHERE archived = 0"
	switch f.Archived {
	case "true":
		where = "WHERE archived = 1"
	case "all":
		where = ""
	}
	q := fmt.Sprintf(`SELECT %s FROM volunteers %s ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`, baseColumns, where)
	rows, err := s.DB.Query(q)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []Volunteer
	for rows.Next() {
		v, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *Store) Get(id int64) (Volunteer, error) {
	q := fmt.Sprintf(`SELECT %s FROM volunteers WHERE id = ?`, baseColumns)
	row := s.DB.QueryRow(q, id)
	v, err := scanRow(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Volunteer{}, ErrNotFound
	}
	return v, err
}

func (s *Store) Create(in Input) (Volunteer, error) {
	roleJSON, err := encodeRoles(in.RoleTypes)
	if err != nil {
		return Volunteer{}, err
	}
	availJSON, err := encodeAvailability(in.Availability)
	if err != nil {
		return Volunteer{}, err
	}
	const q = `INSERT INTO volunteers (
		first_name, last_name, phone, email,
		emergency_contact_name, emergency_contact_phone,
		general_info, customizable_message, role_types, availability,
		default_vs_id, can_drive, license_type, notes, archived
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	res, err := s.DB.Exec(q,
		in.FirstName, in.LastName, in.Phone, in.Email,
		in.EmergencyContactName, in.EmergencyContactPhone,
		in.GeneralInfo, in.CustomizableMessage, roleJSON, availJSON,
		in.DefaultVSID, boolInt(in.CanDrive), in.LicenseType, in.Notes, boolInt(in.Archived),
	)
	if err != nil {
		return Volunteer{}, err
	}
	id, _ := res.LastInsertId()
	return s.Get(id)
}

func (s *Store) Patch(id int64, p Patch) (Volunteer, error) {
	sets := []string{}
	args := []any{}
	if p.FirstName != nil {
		sets = append(sets, "first_name = ?")
		args = append(args, *p.FirstName)
	}
	if p.LastName != nil {
		sets = append(sets, "last_name = ?")
		args = append(args, *p.LastName)
	}
	if p.Phone != nil {
		sets = append(sets, "phone = ?")
		args = append(args, *p.Phone)
	}
	if p.Email != nil {
		sets = append(sets, "email = ?")
		args = append(args, nullableString(*p.Email))
	}
	if p.EmergencyContactName != nil {
		sets = append(sets, "emergency_contact_name = ?")
		args = append(args, nullableString(*p.EmergencyContactName))
	}
	if p.EmergencyContactPhone != nil {
		sets = append(sets, "emergency_contact_phone = ?")
		args = append(args, nullableString(*p.EmergencyContactPhone))
	}
	if p.GeneralInfo != nil {
		sets = append(sets, "general_info = ?")
		args = append(args, nullableString(*p.GeneralInfo))
	}
	if p.CustomizableMessage != nil {
		sets = append(sets, "customizable_message = ?")
		args = append(args, nullableString(*p.CustomizableMessage))
	}
	if p.RoleTypes != nil {
		j, err := encodeRoles(*p.RoleTypes)
		if err != nil {
			return Volunteer{}, err
		}
		sets = append(sets, "role_types = ?")
		args = append(args, j)
	}
	if p.Availability != nil {
		j, err := encodeAvailability(*p.Availability)
		if err != nil {
			return Volunteer{}, err
		}
		sets = append(sets, "availability = ?")
		args = append(args, j)
	}
	if p.DefaultVSID != nil {
		sets = append(sets, "default_vs_id = ?")
		args = append(args, *p.DefaultVSID)
	}
	if p.CanDrive != nil {
		sets = append(sets, "can_drive = ?")
		args = append(args, boolInt(*p.CanDrive))
	}
	if p.LicenseType != nil {
		sets = append(sets, "license_type = ?")
		args = append(args, nullableString(*p.LicenseType))
	}
	if p.Notes != nil {
		sets = append(sets, "notes = ?")
		args = append(args, nullableString(*p.Notes))
	}
	if p.Archived != nil {
		sets = append(sets, "archived = ?")
		args = append(args, boolInt(*p.Archived))
	}
	if len(sets) == 0 {
		return s.Get(id)
	}
	sets = append(sets, "updated_at = datetime('now')")
	q := fmt.Sprintf("UPDATE volunteers SET %s WHERE id = ?", strings.Join(sets, ", "))
	args = append(args, id)
	res, err := s.DB.Exec(q, args...)
	if err != nil {
		return Volunteer{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Volunteer{}, ErrNotFound
	}
	return s.Get(id)
}

// Archive sets archived=1 (soft delete).
func (s *Store) Archive(id int64) (Volunteer, error) {
	t := true
	return s.Patch(id, Patch{Archived: &t})
}

// HardDelete removes the row. If force=false and dependent rows exist (cars
// referencing the volunteer as default driver), it returns *ErrHasDependents
// without touching anything. If force=true, the volunteer is deleted and the
// FK ON DELETE SET NULL clauses null out the dependents.
func (s *Store) HardDelete(id int64, force bool) error {
	dep, err := s.dependents(id)
	if err != nil {
		return err
	}
	if !force && len(dep.Cars) > 0 {
		return &ErrHasDependents{Dependents: dep}
	}
	res, err := s.DB.Exec(`DELETE FROM volunteers WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) dependents(id int64) (Dependents, error) {
	rows, err := s.DB.Query(`SELECT id, name FROM cars WHERE default_driver_id = ? ORDER BY name`, id)
	if err != nil {
		return Dependents{}, err
	}
	defer func() { _ = rows.Close() }()
	var out Dependents
	for rows.Next() {
		var c CarDependent
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return Dependents{}, err
		}
		out.Cars = append(out.Cars, c)
	}
	return out, rows.Err()
}

// AllRoleTypes returns the union of role_types across all volunteers, sorted
// case-insensitively. Used by the autocomplete.
func (s *Store) AllRoleTypes() ([]string, error) {
	rows, err := s.DB.Query(`SELECT role_types FROM volunteers`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	seen := map[string]string{} // lower → original casing of first seen
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var rs []string
		if err := json.Unmarshal([]byte(raw), &rs); err != nil {
			continue
		}
		for _, r := range rs {
			lo := strings.ToLower(strings.TrimSpace(r))
			if lo == "" {
				continue
			}
			if _, ok := seen[lo]; !ok {
				seen[lo] = r
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(seen))
	for _, v := range seen {
		out = append(out, v)
	}
	sortCI(out)
	return out, nil
}

func sortCI(xs []string) {
	for i := 1; i < len(xs); i++ {
		for j := i; j > 0 && strings.ToLower(xs[j-1]) > strings.ToLower(xs[j]); j-- {
			xs[j-1], xs[j] = xs[j], xs[j-1]
		}
	}
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanRow(r rowScanner) (Volunteer, error) {
	var v Volunteer
	var rolesRaw, availRaw string
	var canDriveInt, archivedInt int
	err := r.Scan(
		&v.ID, &v.FirstName, &v.LastName, &v.Phone, &v.Email,
		&v.EmergencyContactName, &v.EmergencyContactPhone,
		&v.GeneralInfo, &v.CustomizableMessage, &rolesRaw, &availRaw,
		&v.DefaultVSID, &canDriveInt, &v.LicenseType, &v.Notes, &archivedInt,
		&v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		return Volunteer{}, err
	}
	v.CanDrive = canDriveInt != 0
	v.Archived = archivedInt != 0
	if rolesRaw != "" {
		_ = json.Unmarshal([]byte(rolesRaw), &v.RoleTypes)
	}
	if v.RoleTypes == nil {
		v.RoleTypes = []string{}
	}
	if availRaw != "" {
		_ = json.Unmarshal([]byte(availRaw), &v.Availability)
	}
	if v.Availability == nil {
		v.Availability = []Availability{}
	}
	return v, nil
}

func encodeRoles(rs []string) (string, error) {
	if rs == nil {
		rs = []string{}
	}
	out := make([]string, 0, len(rs))
	for _, r := range rs {
		r = strings.TrimSpace(r)
		if r == "" {
			continue
		}
		out = append(out, r)
	}
	b, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func encodeAvailability(as []Availability) (string, error) {
	if as == nil {
		as = []Availability{}
	}
	b, err := json.Marshal(as)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// nullableString turns "" into a SQL NULL so the column comparison is consistent
// with the typed Email/etc. nullability.
func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}
