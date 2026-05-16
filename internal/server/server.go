// Package server builds the chi router that the binary serves.
package server

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/csv"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/assignment"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/car"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/mission"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/race"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/racevs"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/volunteer"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/vs"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/warnings"
	"github.com/guillaumetavernier/volunteersmanager/internal/i18n"
)

type Config struct {
	Logger        *slog.Logger
	I18n          *i18n.Catalog
	DB            *sql.DB
	AssetDir      string // where photo uploads land
	TileDir       string // where pmtiles files live
	TileBaseURL   string // upstream prefix for downloads; empty disables remote fetch
	FrontendProxy string // when non-empty, "/" is proxied to this URL (dev only)
}

func New(cfg Config) (http.Handler, error) {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	r := chi.NewRouter()
	r.Use(requestLogger(cfg.Logger))
	r.Use(recoverer(cfg.Logger))
	var warnStore *warnings.Store
	if cfg.DB != nil {
		warnStore = warnings.NewStore(cfg.DB)
		// Scope constraint middleware to the /api subtree only. Non-/api paths
		// (SPA fallback, /tiles/*.pmtiles, /assets/vs/*) must not trigger
		// LoadState/Compute.
		r.Use(apiOnly(constraintMiddleware(cfg.DB, warnStore, cfg.Logger)))
	}

	r.Get("/healthz", healthz)

	if cfg.DB != nil {
		warnings.NewHandler(warnStore).Mount(r)

		eventStore := event.NewStore(cfg.DB)
		event.NewHandler(eventStore).Mount(r)

		raceStore := race.NewStore(cfg.DB)
		raceSvc := race.NewService(cfg.DB)
		missionStore := mission.NewStore(cfg.DB)

		vsHandler := vs.NewHandler(vs.NewStore(cfg.DB), cfg.AssetDir)
		vsHandler.OnMove = func(id int64) {
			if err := raceSvc.RecomputeForVS(id); err != nil {
				cfg.Logger.Warn("recompute after VS move failed", "vs_id", id, "err", err)
			}
		}
		vsHandler.Dependents = func(id int64) (vs.Dependents, error) {
			missions, err := missionStore.CountByVS(id)
			if err != nil {
				return vs.Dependents{}, err
			}
			assignments, err := missionStore.CountAssignmentsByVS(id)
			if err != nil {
				return vs.Dependents{}, err
			}
			return vs.Dependents{Missions: missions, Assignments: assignments}, nil
		}
		vsHandler.Mount(r)

		raceHandler := race.NewHandler(raceStore, raceSvc, cfg.AssetDir)
		raceHandler.OnDelete = func(raceID int64) error {
			if err := missionStore.ScrubRaceTag(raceID); err != nil {
				cfg.Logger.Warn("scrub mission race tag failed", "race_id", raceID, "err", err)
				return err
			}
			return nil
		}
		raceHandler.Mount(r)
		racevs.NewHandler(racevs.NewStore(cfg.DB), raceSvc).Mount(r)

		volStore := volunteer.NewStore(cfg.DB)
		volunteer.NewHandler(volStore, eventStore).Mount(r)
		car.NewHandler(car.NewStore(cfg.DB)).Mount(r)
		csv.NewHandler(csv.NewSessionStore(cfg.DB), volStore, eventStore).Mount(r)

		mission.NewHandler(missionStore).Mount(r)
		assignment.NewHandler(assignment.NewStore(cfg.DB)).Mount(r)
	}
	if cfg.TileDir != "" {
		NewTileService(cfg.TileDir, cfg.TileBaseURL).Mount(r)
	}

	frontend, err := frontendHandler(cfg.FrontendProxy)
	if err != nil {
		return nil, err
	}
	r.Handle("/*", frontend)
	return r, nil
}

func healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func frontendHandler(proxyURL string) (http.Handler, error) {
	if proxyURL == "" {
		return spaHandler()
	}
	target, err := url.Parse(proxyURL)
	if err != nil {
		return nil, err
	}
	return httputil.NewSingleHostReverseProxy(target), nil
}
