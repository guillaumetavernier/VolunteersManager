package routing

import (
	"math"
	"testing"
)

func TestDistance_KnownPoints(t *testing.T) {
	// Paris to Lyon: roughly 391 km great-circle.
	paris := LatLon{Lat: 48.8566, Lon: 2.3522}
	lyon := LatLon{Lat: 45.7640, Lon: 4.8357}
	d := Distance(paris, lyon)
	if d < 390_000 || d > 395_000 {
		t.Fatalf("paris-lyon = %.0f m, want ~391 km", d)
	}
}

func TestDistance_Zero(t *testing.T) {
	p := LatLon{Lat: 48.86, Lon: 2.34}
	if d := Distance(p, p); d != 0 {
		t.Fatalf("self distance = %.6f, want 0", d)
	}
}

func TestDistance_Short(t *testing.T) {
	// 1 degree of latitude ~= 111 km.
	a := LatLon{Lat: 48.0, Lon: 2.0}
	b := LatLon{Lat: 49.0, Lon: 2.0}
	d := Distance(a, b)
	if math.Abs(d-111_000) > 1500 {
		t.Fatalf("1-deg latitude = %.0f m, want ~111 km", d)
	}
}

func TestHaversineOnly_SecondsMatchesSpeed(t *testing.T) {
	// 10 km at 40 km/h = 900 s. Pick two points roughly 10 km apart.
	a := VS{ID: 1, Lat: 48.0, Lon: 2.0}
	b := VS{ID: 2, Lat: 48.0, Lon: 2.135} // ~10 km east at 48° lat
	h := HaversineOnly{Settings: DefaultSettings()}
	sec := h.Seconds(a, b, ModeDrive)
	// 10 km / 40 km/h = 900 s. Allow 60 s slack.
	if sec < 800 || sec > 1000 {
		t.Fatalf("drive 10km @40 = %d s, want ~900", sec)
	}
	walkSec := h.Seconds(a, b, ModeWalk)
	// At 5 km/h: 10 km / 5 = 2 h = 7200 s.
	if walkSec < 7000 || walkSec > 7500 {
		t.Fatalf("walk 10km @5 = %d s, want ~7200", walkSec)
	}
}

func TestHaversineOnly_CustomSpeed(t *testing.T) {
	a := VS{ID: 1, Lat: 0, Lon: 0}
	b := VS{ID: 2, Lat: 0, Lon: 1} // ~111.195 km on equator
	h := HaversineOnly{Settings: Settings{DriveKMH: 100, WalkKMH: 10}}
	sec := h.Seconds(a, b, ModeDrive)
	want := 111195.0 / (100 * 1000.0 / 3600.0) // ~4003 s
	if math.Abs(float64(sec)-want) > 60 {
		t.Fatalf("custom drive = %d s, want ~%.0f", sec, want)
	}
}

func TestHaversineOnly_Source(t *testing.T) {
	if (HaversineOnly{}).Source() != SourceFallback {
		t.Fatalf("haversine source must be fallback")
	}
}
