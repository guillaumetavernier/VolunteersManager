package gpx

import (
	"math"
	"testing"
)

func TestDouglasPeucker_KeepsEndpointsAndCornerOnly(t *testing.T) {
	// L-shape with 5 collinear points along each leg. With a generous tolerance,
	// only the three corners survive.
	pts := []Point{
		{Lat: 0, Lon: 0},
		{Lat: 0, Lon: 0.001},
		{Lat: 0, Lon: 0.002},
		{Lat: 0, Lon: 0.003}, // corner of the L (~333 m east of origin)
		{Lat: 0.001, Lon: 0.003},
		{Lat: 0.002, Lon: 0.003},
		{Lat: 0.003, Lon: 0.003}, // end of the L
	}
	tr := buildTrack(pts)
	out := SimplifyForce(tr, 10.0) // 10 m tolerance
	want := []Point{
		{Lat: 0, Lon: 0},
		{Lat: 0, Lon: 0.003},
		{Lat: 0.003, Lon: 0.003},
	}
	if len(out.Points) != len(want) {
		t.Fatalf("got %d points, want %d (%+v)", len(out.Points), len(want), out.Points)
	}
	for i, p := range out.Points {
		if math.Abs(p.Lat-want[i].Lat) > 1e-9 || math.Abs(p.Lon-want[i].Lon) > 1e-9 {
			t.Fatalf("point %d = (%.6f,%.6f), want (%.6f,%.6f)", i, p.Lat, p.Lon, want[i].Lat, want[i].Lon)
		}
	}
	if out.TotalDistance <= 0 {
		t.Fatalf("TotalDistance not recomputed")
	}
}

func TestSimplify_BelowThresholdReturnsUnchanged(t *testing.T) {
	pts := make([]Point, 100)
	for i := range pts {
		pts[i] = Point{Lat: float64(i) * 0.0001}
	}
	tr := buildTrack(pts)
	out := Simplify(tr)
	if len(out.Points) != len(tr.Points) {
		t.Fatalf("below-threshold track was simplified (got %d, had %d)", len(out.Points), len(tr.Points))
	}
}

func TestSimplify_AboveThresholdReducesCount(t *testing.T) {
	// 6000 points on a perfect line — DP should reduce to 2.
	pts := make([]Point, 6000)
	for i := range pts {
		pts[i] = Point{Lat: float64(i) * 0.00001}
	}
	tr := buildTrack(pts)
	out := Simplify(tr)
	if len(out.Points) >= len(tr.Points) {
		t.Fatalf("above-threshold track was not simplified (got %d, had %d)", len(out.Points), len(tr.Points))
	}
	if len(out.Points) != 2 {
		t.Fatalf("got %d points on a perfect line, want 2", len(out.Points))
	}
}
