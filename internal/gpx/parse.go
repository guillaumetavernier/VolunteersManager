// Package gpx parses GPX files into a flat polyline with cumulative distance,
// simplifies oversized tracks, and projects external points onto the line.
//
// The package treats a GPX file as the ordered concatenation of every trkpt in
// every trkseg of every trk — segments and tracks are flattened. Routes and
// waypoints are ignored. Elevation is parsed but distance is 2D haversine.
package gpx

import (
	"fmt"
	"io"
	"math"

	gpxgo "github.com/tkrajina/gpxgo/gpx"
)

// Point is one polyline vertex with the cumulative metres from the start.
type Point struct {
	Lat      float64 `json:"lat"`
	Lon      float64 `json:"lon"`
	CumDistM float64 `json:"d"`
}

// Track is the parsed polyline.
type Track struct {
	Points        []Point
	TotalDistance float64 // metres
}

// Parse reads a GPX document and returns the flattened track with cumulative
// haversine distances. Points with identical (lat, lon) as the previous point
// are kept verbatim (CumDistM stays equal) so callers don't have to handle
// missing indexes downstream.
func Parse(r io.Reader) (Track, error) {
	body, err := io.ReadAll(r)
	if err != nil {
		return Track{}, fmt.Errorf("gpx: read: %w", err)
	}
	doc, err := gpxgo.ParseBytes(body)
	if err != nil {
		return Track{}, fmt.Errorf("gpx: parse: %w", err)
	}
	var raw []Point
	doc.ExecuteOnTrackPoints(func(p *gpxgo.GPXPoint) {
		raw = append(raw, Point{Lat: p.Latitude, Lon: p.Longitude})
	})
	if len(raw) == 0 {
		return Track{}, fmt.Errorf("gpx: no trkpt elements found")
	}
	return buildTrack(raw), nil
}

// buildTrack fills CumDistM in place using haversine between consecutive points.
func buildTrack(points []Point) Track {
	if len(points) == 0 {
		return Track{}
	}
	cum := 0.0
	out := make([]Point, len(points))
	out[0] = Point{Lat: points[0].Lat, Lon: points[0].Lon, CumDistM: 0}
	for i := 1; i < len(points); i++ {
		cum += HaversineMeters(points[i-1].Lat, points[i-1].Lon, points[i].Lat, points[i].Lon)
		out[i] = Point{Lat: points[i].Lat, Lon: points[i].Lon, CumDistM: cum}
	}
	return Track{Points: out, TotalDistance: cum}
}

// HaversineMeters returns the great-circle distance between two WGS84 points,
// in metres. Uses the standard mean earth radius of 6 371 008.8 m.
func HaversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371008.8
	φ1 := lat1 * math.Pi / 180
	φ2 := lat2 * math.Pi / 180
	Δφ := (lat2 - lat1) * math.Pi / 180
	Δλ := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(Δφ/2)*math.Sin(Δφ/2) +
		math.Cos(φ1)*math.Cos(φ2)*math.Sin(Δλ/2)*math.Sin(Δλ/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}
