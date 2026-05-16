// Package routing owns the travel-time matrix between VS. v1 ships a single
// Provider implementation (HaversineOnly) that derives seconds from great-circle
// distance and a configured speed. The Provider interface exists only so a real
// routing backend can be slotted in later without rippling through callers.
package routing

import "math"

// LatLon is a single geographic point in decimal degrees.
type LatLon struct {
	Lat float64
	Lon float64
}

const earthRadiusM = 6371000.0

// Distance returns the great-circle distance between a and b in meters using
// the haversine formula. Determinism: pure arithmetic, no clock.
func Distance(a, b LatLon) float64 {
	phi1 := a.Lat * math.Pi / 180.0
	phi2 := b.Lat * math.Pi / 180.0
	dphi := (b.Lat - a.Lat) * math.Pi / 180.0
	dlam := (b.Lon - a.Lon) * math.Pi / 180.0
	h := math.Sin(dphi/2)*math.Sin(dphi/2) +
		math.Cos(phi1)*math.Cos(phi2)*math.Sin(dlam/2)*math.Sin(dlam/2)
	c := 2 * math.Atan2(math.Sqrt(h), math.Sqrt(1-h))
	return earthRadiusM * c
}
