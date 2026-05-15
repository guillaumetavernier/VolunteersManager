package gpx

import "math"

const (
	// simplifyThreshold is the raw-point count above which Simplify kicks in.
	simplifyThreshold = 5000
	// simplifyToleranceM is the perpendicular-distance tolerance, in metres.
	simplifyToleranceM = 5.0
)

// Simplify reduces a track to fewer points using Douglas-Peucker when the raw
// count exceeds the threshold. CumDistM values are recomputed from scratch on
// the surviving points. Tracks below the threshold are returned unchanged.
func Simplify(t Track) Track {
	if len(t.Points) <= simplifyThreshold {
		return t
	}
	keep := douglasPeucker(t.Points, simplifyToleranceM)
	return buildTrack(stripCum(keep))
}

// SimplifyForce ignores the threshold and runs the algorithm with the given
// tolerance. Tests use this to drive the algorithm against small fixtures.
func SimplifyForce(t Track, toleranceM float64) Track {
	keep := douglasPeucker(t.Points, toleranceM)
	return buildTrack(stripCum(keep))
}

func stripCum(in []Point) []Point {
	out := make([]Point, len(in))
	for i, p := range in {
		out[i] = Point{Lat: p.Lat, Lon: p.Lon}
	}
	return out
}

// douglasPeucker recursively partitions the polyline, keeping points whose
// perpendicular distance from the line between the partition endpoints exceeds
// the tolerance. The endpoints are always retained.
func douglasPeucker(points []Point, toleranceM float64) []Point {
	if len(points) < 3 {
		out := make([]Point, len(points))
		copy(out, points)
		return out
	}
	keep := make([]bool, len(points))
	keep[0] = true
	keep[len(points)-1] = true
	dpRecurse(points, 0, len(points)-1, toleranceM, keep)
	out := make([]Point, 0, len(points))
	for i, p := range points {
		if keep[i] {
			out = append(out, p)
		}
	}
	return out
}

func dpRecurse(points []Point, lo, hi int, tol float64, keep []bool) {
	if hi <= lo+1 {
		return
	}
	maxDist := 0.0
	maxIdx := lo
	for i := lo + 1; i < hi; i++ {
		d := perpendicularMeters(points[i], points[lo], points[hi])
		if d > maxDist {
			maxDist = d
			maxIdx = i
		}
	}
	if maxDist > tol {
		keep[maxIdx] = true
		dpRecurse(points, lo, maxIdx, tol, keep)
		dpRecurse(points, maxIdx, hi, tol, keep)
	}
}

// perpendicularMeters returns the great-circle distance from p to the segment
// (a,b), approximated by treating local lat/lon as planar after scaling
// longitude by cos(mean_lat). Good enough for the few-km segments that show up
// in races at zoom levels where the simplification tolerance is metres.
func perpendicularMeters(p, a, b Point) float64 {
	meanLat := (a.Lat + b.Lat) * 0.5 * math.Pi / 180
	mPerDegLat := 111320.0
	mPerDegLon := 111320.0 * math.Cos(meanLat)
	px := (p.Lon - a.Lon) * mPerDegLon
	py := (p.Lat - a.Lat) * mPerDegLat
	bx := (b.Lon - a.Lon) * mPerDegLon
	by := (b.Lat - a.Lat) * mPerDegLat
	lenSq := bx*bx + by*by
	if lenSq == 0 {
		return math.Hypot(px, py)
	}
	t := (px*bx + py*by) / lenSq
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	closestX := t * bx
	closestY := t * by
	return math.Hypot(px-closestX, py-closestY)
}
