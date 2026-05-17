// Command volunteers boots the single-binary VolunteersManager server.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"syscall"
	"time"

	roadbookfeature "github.com/guillaumetavernier/volunteersmanager/internal/features/roadbook"
	"github.com/guillaumetavernier/volunteersmanager/internal/i18n"
	"github.com/guillaumetavernier/volunteersmanager/internal/server"
	"github.com/guillaumetavernier/volunteersmanager/internal/store"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		port          = flag.Int("port", 8080, "TCP port to listen on")
		bind          = flag.String("bind", "127.0.0.1", "interface to bind to; v1 forbids non-loopback (see CLAUDE.md)")
		dataDir       = flag.String("data-dir", ".", "directory containing event.db, tiles/ and assets/")
		offlineTiles  = flag.String("offline-tiles", "", "if set, use this directory for .pmtiles instead of <data-dir>/tiles")
		tileBaseURL   = flag.String("tile-base-url", "https://build.protomaps.com", "upstream prefix used by POST /api/tiles/download")
		tileMode      = flag.String("tile-mode", envDefault("VM_TILE_MODE", "auto"), "tile source policy: auto|pmtiles|online (default $VM_TILE_MODE or auto)")
		protomapsKey  = flag.String("protomaps-api-key", os.Getenv("PROTOMAPS_API_KEY"), "Protomaps API key for online tile mode (default $PROTOMAPS_API_KEY)")
		logLevel      = flag.String("log-level", "info", "log level: debug|info|warn|error")
		frontendProxy = flag.String("frontend-proxy", "", "if set, proxy non-API requests to this URL (dev only)")
		openBrowser   = flag.Bool("open", true, "open the default browser on startup")
	)
	flag.Parse()

	logger := newLogger(*logLevel)

	dbPath := filepath.Join(*dataDir, "event.db")
	backupsDir := filepath.Join(*dataDir, "backups")
	if enabled, err := backupEnabled(dbPath); err == nil && enabled {
		if dst, err := server.EnsureDailyBackup(dbPath, backupsDir, time.Now()); err != nil {
			logger.Warn("daily backup failed", "err", err)
		} else if dst != "" {
			logger.Info("daily backup ready", "path", dst)
		}
	}

	st, err := store.Open(dbPath)
	if err != nil {
		return err
	}
	defer func() { _ = st.Close() }()
	if err := st.Migrate(); err != nil {
		return err
	}

	cat, err := i18n.Load()
	if err != nil {
		return err
	}

	tileDir := *offlineTiles
	if tileDir == "" {
		tileDir = filepath.Join(*dataDir, "tiles")
	}
	if err := os.MkdirAll(tileDir, 0o755); err != nil {
		return err
	}
	if server.AreTilesEmpty(tileDir) {
		logger.Info("tiles directory empty; downloader available at POST /api/tiles/download", "dir", tileDir)
	}

	assetDir := filepath.Join(*dataDir, "assets")
	if err := os.MkdirAll(assetDir, 0o755); err != nil {
		return err
	}
	exportDir := filepath.Join(*dataDir, "exports")
	if err := os.MkdirAll(exportDir, 0o755); err != nil {
		return err
	}
	uploadDir := filepath.Join(*dataDir, "imports")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		return err
	}
	if err := roadbookfeature.SweepPreviews(context.Background(), exportDir, time.Hour, time.Now()); err != nil {
		logger.Warn("preview sweep failed", "err", err)
	}

	handler, err := server.New(server.Config{
		Logger:          logger,
		I18n:            cat,
		DB:              st.DB,
		AssetDir:        assetDir,
		ExportDir:       exportDir,
		UploadDir:       uploadDir,
		TileDir:         tileDir,
		TileBaseURL:     *tileBaseURL,
		TileMode:        *tileMode,
		ProtomapsAPIKey: *protomapsKey,
		FrontendProxy:   *frontendProxy,
	})
	if err != nil {
		return err
	}

	addr := net.JoinHostPort(*bind, strconv.Itoa(*port))
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", addr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	if *openBrowser {
		go openURL(logger, fmt.Sprintf("http://%s/", addr))
	}

	select {
	case <-ctx.Done():
		logger.Info("shutting down")
	case err := <-errCh:
		return err
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	return httpServer.Shutdown(shutdownCtx)
}

func newLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: lvl}))
}

// backupEnabled reads events.settings JSON and returns the value of
// settings.backup.daily. Missing rows, missing keys or unreadable DBs yield
// false; daily backup is opt-in.
func backupEnabled(dbPath string) (bool, error) {
	if _, err := os.Stat(dbPath); err != nil {
		return false, nil
	}
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return false, err
	}
	defer func() { _ = db.Close() }()
	var settings string
	row := db.QueryRow(`SELECT settings FROM events WHERE id = 1`)
	if err := row.Scan(&settings); err != nil {
		return false, nil
	}
	if settings == "" {
		return false, nil
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal([]byte(settings), &top); err != nil {
		return false, nil
	}
	raw, ok := top["backup"]
	if !ok {
		return false, nil
	}
	var b struct {
		Daily bool `json:"daily"`
	}
	if err := json.Unmarshal(raw, &b); err != nil {
		return false, nil
	}
	return b.Daily, nil
}

// envDefault returns the value of the env var if non-empty, otherwise the
// fallback. Used as a flag default so users can ship secrets / config via
// systemd EnvironmentFile or .env files without exposing them in `ps`
// output or the unit's ExecStart line. A flag value on the command line
// still overrides because flag.Parse runs after this.
func envDefault(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func openURL(logger *slog.Logger, url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		logger.Debug("open browser failed", "err", err)
	}
}
