package server

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEnsureDailyBackup_CreatesOnceIdempotent(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "event.db")
	if err := os.WriteFile(dbPath, []byte("SQLITE-FAKE-BODY"), 0o644); err != nil {
		t.Fatalf("seed db: %v", err)
	}
	backups := filepath.Join(dir, "backups")
	clock := time.Date(2026, 5, 16, 9, 0, 0, 0, time.UTC)

	first, err := EnsureDailyBackup(dbPath, backups, clock)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	if first == "" {
		t.Fatalf("expected a path, got empty")
	}
	got, err := os.ReadFile(first)
	if err != nil {
		t.Fatalf("read backup: %v", err)
	}
	if string(got) != "SQLITE-FAKE-BODY" {
		t.Fatalf("backup body mismatch: %q", got)
	}

	if err := os.WriteFile(dbPath, []byte("CHANGED-AFTER-BACKUP"), 0o644); err != nil {
		t.Fatalf("rewrite db: %v", err)
	}
	second, err := EnsureDailyBackup(dbPath, backups, clock)
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if second != first {
		t.Fatalf("paths differ: %q vs %q", first, second)
	}
	again, err := os.ReadFile(first)
	if err != nil {
		t.Fatalf("read backup 2: %v", err)
	}
	if string(again) != "SQLITE-FAKE-BODY" {
		t.Fatalf("idempotency violated: %q", again)
	}

	// Advance a day; new file appears.
	next := clock.Add(24 * time.Hour)
	tomorrow, err := EnsureDailyBackup(dbPath, backups, next)
	if err != nil {
		t.Fatalf("tomorrow: %v", err)
	}
	if tomorrow == first {
		t.Fatalf("expected different path for new day")
	}
}

func TestEnsureDailyBackup_NoDBYet(t *testing.T) {
	dir := t.TempDir()
	dst, err := EnsureDailyBackup(filepath.Join(dir, "event.db"), filepath.Join(dir, "backups"), time.Now())
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if dst != "" {
		t.Fatalf("expected empty result for missing DB, got %q", dst)
	}
}
