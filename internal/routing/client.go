package routing

import "math"

// Settings carries the configurable speeds used by HaversineOnly. Defaults are
// 40 km/h drive, 5 km/h walk (locked in milestone 06).
type Settings struct {
	DriveKMH float64
	WalkKMH  float64
}

// DefaultSettings returns the locked-default speeds.
func DefaultSettings() Settings {
	return Settings{DriveKMH: 40, WalkKMH: 5}
}

// VS is a minimal projection of a VS row — only what's needed to compute
// matrix cells. Avoids importing the vs feature here.
type VS struct {
	ID  int64
	Lat float64
	Lon float64
}

// Provider abstracts the strategy used to derive seconds between two VS in a
// given mode. v1 ships exactly one implementation: HaversineOnly. ORS/OSRM
// clients are deferred per the milestone-06 locked decision.
type Provider interface {
	Seconds(from, to VS, mode string) int
	// Source returns the value to record in travel_times.source — always
	// "fallback" for the haversine provider.
	Source() string
}

// HaversineOnly turns great-circle distance into seconds at a configured speed.
type HaversineOnly struct {
	Settings Settings
}

func (h HaversineOnly) Seconds(from, to VS, mode string) int {
	d := Distance(LatLon{Lat: from.Lat, Lon: from.Lon}, LatLon{Lat: to.Lat, Lon: to.Lon})
	kmh := h.Settings.DriveKMH
	if mode == ModeWalk {
		kmh = h.Settings.WalkKMH
	}
	if kmh <= 0 {
		kmh = 40
	}
	mps := kmh * 1000.0 / 3600.0
	sec := d / mps
	if math.IsNaN(sec) || math.IsInf(sec, 0) || sec < 0 {
		return 0
	}
	return int(math.Round(sec))
}

func (HaversineOnly) Source() string { return SourceFallback }
