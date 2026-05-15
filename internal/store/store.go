// Package store owns the SQLite connection and migration runner.
package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

type Store struct {
	DB   *sql.DB
	Path string
}

// Open opens (or creates) the SQLite file at path and applies the pragmas the
// rest of the app relies on. The caller owns the lifetime; call Close on shutdown.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("store: open %q: %w", path, err)
	}
	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA synchronous=NORMAL",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("store: %s: %w", p, err)
		}
	}
	return &Store{DB: db, Path: path}, nil
}

func (s *Store) Close() error {
	if s == nil || s.DB == nil {
		return nil
	}
	return s.DB.Close()
}
