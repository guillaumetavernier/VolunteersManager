package constraints

import (
	"strconv"
	"strings"
)

// parseHM parses an "HH:MM" string into minutes since midnight. Out-of-range
// or malformed input returns 0; the engine treats malformed windows as empty.
func parseHM(s string) int {
	s = strings.TrimSpace(s)
	if len(s) < 4 {
		return 0
	}
	colon := strings.IndexByte(s, ':')
	if colon < 1 {
		return 0
	}
	h, err := strconv.Atoi(s[:colon])
	if err != nil {
		return 0
	}
	m, err := strconv.Atoi(s[colon+1:])
	if err != nil {
		return 0
	}
	return h*60 + m
}

// missionInterval returns the absolute minute interval [start, end) for a
// mission given the event day (0-based). Missions whose end time is <= start
// are treated as ending at start (zero-length, ignored downstream).
func missionInterval(m Mission) (int, int) {
	start := m.Day*24*60 + parseHM(m.StartTime)
	end := m.Day*24*60 + parseHM(m.EndTime)
	if end < start {
		end = start
	}
	return start, end
}

// availInterval returns the absolute minute interval for an availability window.
func availInterval(a AvailabilityWindow) (int, int) {
	start := a.Day*24*60 + parseHM(a.Start)
	end := a.Day*24*60 + parseHM(a.End)
	if end < start {
		end = start
	}
	return start, end
}
