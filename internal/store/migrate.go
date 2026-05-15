package store

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

var migrationNameRE = regexp.MustCompile(`^(\d{4})_[a-z][a-z0-9_]*\.sql$`)

type migration struct {
	version int
	name    string
	body    string
}

// Migrate applies any pending migrations in numeric order. Before applying
// anything, it writes a sidecar backup at store.Path + ".bak". The function is
// idempotent: re-running after a successful migrate is a no-op.
//
// Migration files live in internal/store/migrations and are named NNNN_slug.sql.
// Gaps and version skips are rejected.
func (s *Store) Migrate() error {
	return migrateFS(s.DB, s.Path, migrationsFS)
}

func migrateFS(db *sql.DB, path string, files fs.FS) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version    INTEGER PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`); err != nil {
		return fmt.Errorf("migrate: ensure schema_migrations: %w", err)
	}

	applied, err := loadApplied(db)
	if err != nil {
		return err
	}
	all, err := loadMigrations(files)
	if err != nil {
		return err
	}

	pending := make([]migration, 0, len(all))
	for _, m := range all {
		if !applied[m.version] {
			pending = append(pending, m)
		}
	}
	if len(pending) == 0 {
		return nil
	}

	// Backup before applying anything. In-memory stores have no path and skip
	// the backup; the on-disk path may also not exist yet on first boot.
	if path != "" && path != ":memory:" {
		if err := backup(path); err != nil {
			return fmt.Errorf("migrate: backup: %w", err)
		}
	}

	expected := nextVersion(applied)
	for _, m := range pending {
		if m.version != expected {
			return fmt.Errorf("migrate: version gap: expected %04d, found %04d (%s)", expected, m.version, m.name)
		}
		if err := apply(db, m); err != nil {
			return err
		}
		expected++
	}
	return nil
}

func loadApplied(db *sql.DB) (map[int]bool, error) {
	rows, err := db.Query(`SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, fmt.Errorf("migrate: list applied: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := map[int]bool{}
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out[v] = true
	}
	return out, rows.Err()
}

func loadMigrations(files fs.FS) ([]migration, error) {
	entries, err := fs.ReadDir(files, "migrations")
	if err != nil {
		return nil, fmt.Errorf("migrate: read dir: %w", err)
	}
	out := make([]migration, 0, len(entries))
	seen := map[int]string{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		m := migrationNameRE.FindStringSubmatch(e.Name())
		if m == nil {
			return nil, fmt.Errorf("migrate: bad migration filename %q (want NNNN_slug.sql)", e.Name())
		}
		v, _ := strconv.Atoi(m[1])
		if prev, dup := seen[v]; dup {
			return nil, fmt.Errorf("migrate: duplicate version %04d (%s and %s)", v, prev, e.Name())
		}
		seen[v] = e.Name()
		body, err := fs.ReadFile(files, "migrations/"+e.Name())
		if err != nil {
			return nil, fmt.Errorf("migrate: read %s: %w", e.Name(), err)
		}
		out = append(out, migration{version: v, name: e.Name(), body: string(body)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].version < out[j].version })
	if len(out) > 0 {
		if out[0].version != 1 {
			return nil, fmt.Errorf("migrate: sequence must start at 0001, got %04d", out[0].version)
		}
		for i := 1; i < len(out); i++ {
			if out[i].version != out[i-1].version+1 {
				return nil, fmt.Errorf("migrate: gap between %04d and %04d", out[i-1].version, out[i].version)
			}
		}
	}
	return out, nil
}

func nextVersion(applied map[int]bool) int {
	max := 0
	for v := range applied {
		if v > max {
			max = v
		}
	}
	return max + 1
}

func apply(db *sql.DB, m migration) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("migrate: begin %s: %w", m.name, err)
	}
	if _, err := tx.Exec(m.body); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("migrate: apply %s: %w", m.name, err)
	}
	if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, m.version); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("migrate: record %s: %w", m.name, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("migrate: commit %s: %w", m.name, err)
	}
	return nil
}

func backup(path string) error {
	src, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer func() { _ = src.Close() }()

	dstPath := path + ".bak"
	if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
		return err
	}
	dst, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		_ = dst.Close()
		return err
	}
	return dst.Close()
}
