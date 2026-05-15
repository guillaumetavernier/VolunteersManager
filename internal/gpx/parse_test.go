package gpx

import (
	"math"
	"os"
	"testing"
)

func TestParse_FlattenSegmentsInOrder(t *testing.T) {
	f, err := os.Open("testdata/two_segments.gpx")
	if err != nil {
		t.Fatalf("open fixture: %v", err)
	}
	defer f.Close()
	tr, err := Parse(f)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(tr.Points) != 5 {
		t.Fatalf("len(points) = %d, want 5 (segments concatenated)", len(tr.Points))
	}
	if tr.Points[0].CumDistM != 0 {
		t.Fatalf("first CumDistM = %v, want 0", tr.Points[0].CumDistM)
	}
	for i := 1; i < len(tr.Points); i++ {
		if tr.Points[i].CumDistM < tr.Points[i-1].CumDistM {
			t.Fatalf("non-monotone cumulative distance at i=%d", i)
		}
	}
	if math.Abs(tr.TotalDistance-tr.Points[len(tr.Points)-1].CumDistM) > 1e-6 {
		t.Fatalf("TotalDistance mismatch")
	}
}

func TestParse_EmptyTrackRejected(t *testing.T) {
	empty := `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"></gpx>`
	if _, err := Parse(stringReader(empty)); err == nil {
		t.Fatalf("expected error on no-trkpt GPX")
	}
}

func TestHaversine_KnownDistance(t *testing.T) {
	// Eiffel Tower (48.8584, 2.2945) → Arc de Triomphe (48.8738, 2.2950) ≈ 1.71 km.
	got := HaversineMeters(48.8584, 2.2945, 48.8738, 2.2950)
	if math.Abs(got-1715) > 30 {
		t.Fatalf("haversine = %.1f m, want ~1715 m", got)
	}
}

type strReader struct{ s string; i int }

func (r *strReader) Read(p []byte) (int, error) {
	if r.i >= len(r.s) {
		return 0, errEOF
	}
	n := copy(p, r.s[r.i:])
	r.i += n
	return n, nil
}

func stringReader(s string) *strReader { return &strReader{s: s} }

var errEOF = error_eof{}

type error_eof struct{}

func (error_eof) Error() string { return "EOF" }
