package gpx

import (
	"math"
	"testing"
)

func TestNearestOnTrack_PointOnLineGivesZeroDistance(t *testing.T) {
	tr := buildTrack([]Point{
		{Lat: 48.85, Lon: 2.30},
		{Lat: 48.86, Lon: 2.31},
		{Lat: 48.87, Lon: 2.32},
	})
	// Pick the middle vertex exactly.
	proj := NearestOnTrack(tr.Points, 48.86, 2.31)
	if proj.DistFromVS > 1.0 {
		t.Fatalf("dist = %v m, want ~0", proj.DistFromVS)
	}
	if math.Abs(proj.CumDistM-tr.Points[1].CumDistM) > 1.0 {
		t.Fatalf("cum dist = %v, want %v", proj.CumDistM, tr.Points[1].CumDistM)
	}
}

func TestNearestOnTrack_OffTrackPointProjectsInside(t *testing.T) {
	tr := buildTrack([]Point{
		{Lat: 0, Lon: 0},
		{Lat: 0, Lon: 0.01},
	})
	// Point 0.001 deg north of the midpoint: ~111 m perpendicular.
	proj := NearestOnTrack(tr.Points, 0.001, 0.005)
	if math.Abs(proj.DistFromVS-111.32) > 5 {
		t.Fatalf("dist = %.1f m, want ~111 m", proj.DistFromVS)
	}
	expectedCum := tr.TotalDistance * 0.5
	if math.Abs(proj.CumDistM-expectedCum) > 5 {
		t.Fatalf("cum = %.1f m, want ~%.1f m (midpoint)", proj.CumDistM, expectedCum)
	}
}

func TestNearestOnTrack_OffTrackPointBeyondEndClampsToEnd(t *testing.T) {
	tr := buildTrack([]Point{
		{Lat: 0, Lon: 0},
		{Lat: 0, Lon: 0.01},
	})
	// Point far beyond the east end of the segment.
	proj := NearestOnTrack(tr.Points, 0, 0.02)
	if math.Abs(proj.CumDistM-tr.TotalDistance) > 1.0 {
		t.Fatalf("cum = %v, want clamped to end %v", proj.CumDistM, tr.TotalDistance)
	}
}

func TestNearestOnTrack_EmptyTrack(t *testing.T) {
	proj := NearestOnTrack(nil, 0, 0)
	if !math.IsInf(proj.DistFromVS, 1) {
		t.Fatalf("empty track DistFromVS = %v, want +Inf", proj.DistFromVS)
	}
}

func TestMerge_PreservesMonotoneCumDist(t *testing.T) {
	t1 := buildTrack([]Point{
		{Lat: 0, Lon: 0},
		{Lat: 0, Lon: 0.001},
	})
	t2 := buildTrack([]Point{
		{Lat: 0, Lon: 0.001},
		{Lat: 0, Lon: 0.002},
	})
	merged := Merge([]Track{t1, t2})
	for i := 1; i < len(merged.Points); i++ {
		if merged.Points[i].CumDistM < merged.Points[i-1].CumDistM {
			t.Fatalf("non-monotone at i=%d", i)
		}
	}
	expected := t1.TotalDistance + t2.TotalDistance
	if math.Abs(merged.TotalDistance-expected) > 1 {
		t.Fatalf("merged total = %v, want %v", merged.TotalDistance, expected)
	}
}
