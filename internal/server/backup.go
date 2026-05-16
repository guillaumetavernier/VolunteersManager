package server

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// EnsureDailyBackup copies dbPath to backupsDir/event.db.YYYY-MM-DD if the
// dated file is not present yet. Returns the destination path it (re)used.
// Missing dbPath is not an error — the very first startup before the wizard
// has no DB to back up.
func EnsureDailyBackup(dbPath, backupsDir string, now time.Time) (string, error) {
	if dbPath == "" {
		return "", nil
	}
	if _, err := os.Stat(dbPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	if err := os.MkdirAll(backupsDir, 0o755); err != nil {
		return "", err
	}
	stamp := now.Format("2006-01-02")
	dst := filepath.Join(backupsDir, fmt.Sprintf("event.db.%s", stamp))
	if _, err := os.Stat(dst); err == nil {
		return dst, nil
	}

	src, err := os.Open(dbPath)
	if err != nil {
		return "", err
	}
	defer func() { _ = src.Close() }()
	out, err := os.Create(dst)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(out, src); err != nil {
		_ = out.Close()
		_ = os.Remove(dst)
		return "", err
	}
	if err := out.Close(); err != nil {
		return "", err
	}
	return dst, nil
}
