package gpx

import "math"

// Projection describes where on a track the nearest point to a given (lat, lon)
// lies.
type Projection struct {
	SegmentIdx int     // index of the segment start point (the projection lies between points[SegmentIdx] and SegmentIdx+1)
	DistFromVS float64 // perpendicular distance from VS to the projected point, metres
	CumDistM   float64 // cumulative distance from the track start to the projected point, metres
	Lat        float64 // latitude of the projected point on the track
	Lon        float64 // longitude of the projected point on the track
}

// NearestOnTrack finds the closest point on the track polyline to (lat, lon).
// Returns the per-segment projection along with cumulative distance. Single-
// point or empty tracks degrade gracefully: an empty track returns a zero
// Projection with DistFromVS = +Inf so callers can detect "no track".
func NearestOnTrack(points []Point, lat, lon float64) Projection {
	if len(points) == 0 {
		return Projection{DistFromVS: math.Inf(1)}
	}
	if len(points) == 1 {
		return Projection{
			SegmentIdx: 0,
			DistFromVS: HaversineMeters(lat, lon, points[0].Lat, points[0].Lon),
			CumDistM:   points[0].CumDistM,
			Lat:        points[0].Lat,
			Lon:        points[0].Lon,
		}
	}
	best := Projection{DistFromVS: math.Inf(1)}
	for i := 0; i < len(points)-1; i++ {
		proj := projectOntoSegment(points[i], points[i+1], lat, lon)
		if proj.DistFromVS < best.DistFromVS {
			best = proj
			best.SegmentIdx = i
		}
	}
	return best
}

// projectOntoSegment finds the closest point on segment (a,b) to (lat,lon),
// using the same local planar approximation as perpendicularMeters. The
// returned CumDistM interpolates between a.CumDistM and b.CumDistM by the
// parameter t.
func projectOntoSegment(a, b Point, lat, lon float64) Projection {
	meanLat := (a.Lat + b.Lat) * 0.5 * math.Pi / 180
	mPerDegLat := 111320.0
	mPerDegLon := 111320.0 * math.Cos(meanLat)
	px := (lon - a.Lon) * mPerDegLon
	py := (lat - a.Lat) * mPerDegLat
	bx := (b.Lon - a.Lon) * mPerDegLon
	by := (b.Lat - a.Lat) * mPerDegLat
	lenSq := bx*bx + by*by
	t := 0.0
	if lenSq > 0 {
		t = (px*bx + py*by) / lenSq
		if t < 0 {
			t = 0
		} else if t > 1 {
			t = 1
		}
	}
	closestLat := a.Lat + t*(b.Lat-a.Lat)
	closestLon := a.Lon + t*(b.Lon-a.Lon)
	return Projection{
		DistFromVS: HaversineMeters(lat, lon, closestLat, closestLon),
		CumDistM:   a.CumDistM + t*(b.CumDistM-a.CumDistM),
		Lat:        closestLat,
		Lon:        closestLon,
	}
}

// Merge concatenates tracks in order, restarting from the end-of-prev cumulative
// distance so the combined polyline has monotone CumDistM. Used by the
// recompute service when a race has multiple GPX files.
func Merge(tracks []Track) Track {
	if len(tracks) == 0 {
		return Track{}
	}
	if len(tracks) == 1 {
		return tracks[0]
	}
	var out []Point
	cum := 0.0
	for ti, t := range tracks {
		for i, p := range t.Points {
			if ti > 0 && i == 0 {
				// Drop the duplicate join-point if the new track starts where the prev ended.
				continue
			}
			out = append(out, Point{Lat: p.Lat, Lon: p.Lon, CumDistM: cum + p.CumDistM})
		}
		cum += t.TotalDistance
	}
	return Track{Points: out, TotalDistance: cum}
}
