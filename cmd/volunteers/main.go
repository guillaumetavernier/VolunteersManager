// Command volunteers boots the single-binary VolunteersManager server.
package main

import (
	"context"
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
		logLevel      = flag.String("log-level", "info", "log level: debug|info|warn|error")
		frontendProxy = flag.String("frontend-proxy", "", "if set, proxy non-API requests to this URL (dev only)")
		openBrowser   = flag.Bool("open", true, "open the default browser on startup")
	)
	flag.Parse()

	logger := newLogger(*logLevel)

	st, err := store.Open(filepath.Join(*dataDir, "event.db"))
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
	if err := roadbookfeature.SweepPreviews(context.Background(), exportDir, time.Hour, time.Now()); err != nil {
		logger.Warn("preview sweep failed", "err", err)
	}

	handler, err := server.New(server.Config{
		Logger:        logger,
		I18n:          cat,
		DB:            st.DB,
		AssetDir:      assetDir,
		ExportDir:     exportDir,
		TileDir:       tileDir,
		TileBaseURL:   *tileBaseURL,
		FrontendProxy: *frontendProxy,
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
