// Package server builds the chi router that the binary serves.
package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/go-chi/chi/v5"

	"github.com/guillaumetavernier/volunteersmanager/internal/csv"
	archivefeature "github.com/guillaumetavernier/volunteersmanager/internal/features/archive"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/assignment"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/car"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/mission"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/race"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/racevs"
	roadbookfeature "github.com/guillaumetavernier/volunteersmanager/internal/features/roadbook"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/trial"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/trip"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/volunteer"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/vs"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/warnings"
	"github.com/guillaumetavernier/volunteersmanager/internal/i18n"
	"github.com/guillaumetavernier/volunteersmanager/internal/routing"
)

type Config struct {
	Logger          *slog.Logger
	I18n            *i18n.Catalog
	DB              *sql.DB
	AssetDir        string // where photo uploads land
	ExportDir       string // where roadbook PDFs land (typically <data-dir>/exports)
	UploadDir       string // where imported archive DBs land (typically <data-dir>/imports)
	TileDir         string // where pmtiles files live
	TileBaseURL     string // upstream prefix for downloads; empty disables remote fetch
	TileMode        string // "auto" | "pmtiles" | "online"; controls /api/tiles/source resolution
	ProtomapsAPIKey string // required when resolving to online mode
	FrontendProxy   string // when non-empty, "/" is proxied to this URL (dev only)
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
		r.Use(apiOnly(constraintMiddleware(cfg.DB, warnStore, cfg.Logger)))
	}

	r.Get("/healthz", healthz)

	if cfg.DB != nil {
		warnings.NewHandler(warnStore).Mount(r)

		eventStore := event.NewStore(cfg.DB)
		eventHandler := event.NewHandler(eventStore)
		eventHandler.AssetDir = cfg.AssetDir
		eventHandler.Mount(r)

		raceStore := race.NewStore(cfg.DB)
		raceSvc := race.NewService(cfg.DB)
		missionStore := mission.NewStore(cfg.DB)
		tripStore := trip.NewStore(cfg.DB)
		routingProvider := routing.HaversineOnly{Settings: routing.DefaultSettings()}
		recomputeMatrix := func() {
			ctx := context.Background()
			vsList, err := routing.LoadVS(ctx, cfg.DB)
			if err != nil {
				cfg.Logger.Warn("matrix: load vs failed", "err", err)
				return
			}
			if err := routing.RecomputeMatrix(ctx, cfg.DB, vsList, routingProvider); err != nil {
				cfg.Logger.Warn("matrix: recompute failed", "err", err)
			}
		}

		vsHandler := vs.NewHandler(vs.NewStore(cfg.DB), cfg.AssetDir)
		vsHandler.OnMove = func(id int64) {
			if err := raceSvc.RecomputeForVS(id); err != nil {
				cfg.Logger.Warn("recompute after VS move failed", "vs_id", id, "err", err)
			}
			recomputeMatrix()
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
			trips, err := tripStore.CountTripsByVS(id)
			if err != nil {
				return vs.Dependents{}, err
			}
			return vs.Dependents{Missions: missions, Assignments: assignments, Trips: trips}, nil
		}
		vsHandler.ForceCascade = func(id int64) error {
			return tripStore.DeleteTripsByVS(id)
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
		trial.NewHandler(trial.NewStore(cfg.DB), raceSvc, cfg.AssetDir).Mount(r)

		volStore := volunteer.NewStore(cfg.DB)
		volHandler := volunteer.NewHandler(volStore, eventStore)
		volHandler.TripsForDriver = func(volunteerID int64) ([]int64, error) {
			return tripStore.TripsByDriver(volunteerID)
		}
		volHandler.Mount(r)
		carHandler := car.NewHandler(car.NewStore(cfg.DB))
		carHandler.TripsForCar = func(carID int64) ([]int64, error) {
			return tripStore.TripsByCar(carID)
		}
		carHandler.Mount(r)
		csv.NewHandler(csv.NewSessionStore(cfg.DB), volStore, eventStore).Mount(r)

		mission.NewHandler(missionStore).Mount(r)
		assignment.NewHandler(assignment.NewStore(cfg.DB)).Mount(r)
		trip.NewHandler(tripStore, cfg.DB).Mount(r)
		routing.NewHandler(cfg.DB, routingProvider).Mount(r)
		if cfg.ExportDir != "" {
			roadbookfeature.NewHandler(cfg.DB, eventStore, cfg.AssetDir, cfg.ExportDir).Mount(r)
		}
		if cfg.UploadDir != "" {
			archivefeature.NewHandler(cfg.DB, eventStore, cfg.AssetDir, cfg.UploadDir).Mount(r)
		}
	}
	if cfg.TileDir != "" {
		svc := NewTileService(cfg.TileDir, cfg.TileBaseURL)
		svc.Mode = cfg.TileMode
		svc.ProtomapsAPIKey = cfg.ProtomapsAPIKey
		svc.Mount(r)
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
