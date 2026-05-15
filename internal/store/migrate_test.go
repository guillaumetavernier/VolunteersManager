package store

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"

	_ "modernc.org/sqlite"
)

func openMem(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestMigrate_AppliesEmbeddedAndIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if err := s.Migrate(); err != nil {
		t.Fatalf("first Migrate: %v", err)
	}
	var n int
	if err := s.DB.QueryRow(`SELECT count(*) FROM schema_migrations`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n == 0 {
		t.Fatalf("expected at least one migration applied")
	}
	if err := s.Migrate(); err != nil {
		t.Fatalf("re-run Migrate: %v", err)
	}
	var n2 int
	if err := s.DB.QueryRow(`SELECT count(*) FROM schema_migrations`).Scan(&n2); err != nil {
		t.Fatalf("count after re-run: %v", err)
	}
	if n != n2 {
		t.Fatalf("re-run should be a no-op, before=%d after=%d", n, n2)
	}
}

func TestMigrate_BacksUpExistingFileBeforeApplying(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.db")
	// Pre-seed the file by opening once with no migrations applied yet — then
	// close and re-open so the on-disk file definitely exists.
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if _, err := s.DB.Exec(`CREATE TABLE marker (x INTEGER)`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := s.DB.Exec(`INSERT INTO marker VALUES (1)`); err != nil {
		t.Fatalf("insert: %v", err)
	}
	_ = s.Close()

	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected db file at %s: %v", path, err)
	}

	s2, err := Open(path)
	if err != nil {
		t.Fatalf("re-Open: %v", err)
	}
	t.Cleanup(func() { _ = s2.Close() })
	if err := s2.Migrate(); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if _, err := os.Stat(path + ".bak"); err != nil {
		t.Fatalf("expected backup at %s.bak: %v", path, err)
	}
}

func TestMigrate_RejectsGapsAndSkips(t *testing.T) {
	db := openMem(t)
	// FS with 0001 and 0003 — missing 0002 must be detected.
	files := fstest.MapFS{
		"migrations/0001_a.sql": &fstest.MapFile{Data: []byte(`CREATE TABLE a (id INTEGER)`)},
		"migrations/0003_c.sql": &fstest.MapFile{Data: []byte(`CREATE TABLE c (id INTEGER)`)},
	}
	if err := migrateFS(db, "", files); err == nil {
		t.Fatalf("expected gap to be rejected")
	}
}

func TestMigrate_RejectsBadFilename(t *testing.T) {
	db := openMem(t)
	files := fstest.MapFS{
		"migrations/bad.sql": &fstest.MapFile{Data: []byte(`SELECT 1`)},
	}
	if err := migrateFS(db, "", files); err == nil {
		t.Fatalf("expected bad filename to be rejected")
	}
}
