package roadbook

import (
	"bytes"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
)

var updateGolden = flag.Bool("update-golden", false, "rewrite testdata/expected_*.pdf golden files")

// TestGolden_VolunteerOne asserts the per-volunteer PDF is byte-identical to
// the committed golden fixture. Run with -update-golden to regenerate after a
// deliberate template change.
func TestGolden_VolunteerOne(t *testing.T) {
	state := fixtureState()
	settings := event.DefaultRoadbookSettings()
	for _, id := range []int64{1, 2, 5} {
		data, err := BuildVolunteerData(state, id)
		if err != nil {
			t.Fatalf("gather %d: %v", id, err)
		}
		var buf bytes.Buffer
		if err := RenderVolunteer(data, settings, "", &buf); err != nil {
			t.Fatalf("render %d: %v", id, err)
		}
		path := filepath.Join("testdata", "expected_volunteer_"+itoa(id)+".pdf")
		if *updateGolden {
			if err := os.WriteFile(path, buf.Bytes(), 0o644); err != nil {
				t.Fatalf("write golden: %v", err)
			}
			continue
		}
		want, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read golden %s: %v (run with -update-golden to create)", path, err)
		}
		if !bytes.Equal(want, buf.Bytes()) {
			t.Fatalf("golden mismatch for volunteer %d (len got=%d want=%d)", id, buf.Len(), len(want))
		}
	}
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	out := []byte{}
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		out = append([]byte{byte('0' + n%10)}, out...)
		n /= 10
	}
	if neg {
		out = append([]byte{'-'}, out...)
	}
	return string(out)
}
