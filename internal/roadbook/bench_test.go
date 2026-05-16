package roadbook

import (
	"bytes"
	"testing"

	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
)

func BenchmarkRenderFixture(b *testing.B) {
	state := fixtureState()
	settings := event.DefaultRoadbookSettings()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, id := range state.VolunteerIDs {
			data, _ := BuildVolunteerData(state, id)
			var buf bytes.Buffer
			_ = RenderVolunteer(data, settings, "", &buf)
		}
		var m bytes.Buffer
		_ = RenderMaster(state, settings, "", &m)
	}
}
