//go:build ignore

// bench_constraints generates a 100-volunteer / 200-mission fixture, runs the
// constraint engine, and asserts the elapsed time is below 100ms. Run with:
//
//	go run ./scripts/bench_constraints.go
package main

import (
	"fmt"
	"math/rand"
	"os"
	"time"

	"github.com/guillaumetavernier/volunteersmanager/internal/domain/constraints"
)

func main() {
	const (
		nVols     = 100
		nMissions = 200
		nAssigns  = 400
		budgetMs  = 100
	)

	rng := rand.New(rand.NewSource(42))
	roles := []string{"signaleur", "ravitaillement", "logistique", "barriereur", "secours"}

	vols := make([]constraints.Volunteer, 0, nVols)
	for i := 1; i <= nVols; i++ {
		// 80% have role types; 90% have a phone; everyone has full availability
		var rs []string
		if rng.Float64() < 0.8 {
			rs = []string{roles[rng.Intn(len(roles))]}
		}
		phone := "0600000000"
		if rng.Float64() < 0.1 {
			phone = ""
		}
		avail := []constraints.AvailabilityWindow{
			{Day: 1, Start: "06:00", End: "23:00"},
			{Day: 2, Start: "06:00", End: "23:00"},
		}
		vols = append(vols, constraints.Volunteer{
			ID: int64(i), FirstName: fmt.Sprintf("V%d", i), LastName: "X",
			Phone: phone, RoleTypes: rs, Availability: avail,
		})
	}

	missions := make([]constraints.Mission, 0, nMissions)
	for i := 1; i <= nMissions; i++ {
		day := 1 + rng.Intn(2)
		start := 6 + rng.Intn(14)
		dur := 1 + rng.Intn(4)
		end := start + dur
		if end > 23 {
			end = 23
		}
		missions = append(missions, constraints.Mission{
			ID:        int64(i),
			Day:       day,
			StartTime: fmt.Sprintf("%02d:00", start),
			EndTime:   fmt.Sprintf("%02d:00", end),
			RoleType:  roles[rng.Intn(len(roles))],
			Headcount: 1 + rng.Intn(3),
		})
	}

	assigns := make([]constraints.Assignment, 0, nAssigns)
	for i := 1; i <= nAssigns; i++ {
		assigns = append(assigns, constraints.Assignment{
			ID:          int64(i),
			MissionID:   missions[rng.Intn(len(missions))].ID,
			VolunteerID: vols[rng.Intn(len(vols))].ID,
		})
	}

	state := constraints.EventState{
		Volunteers:  vols,
		Missions:    missions,
		Assignments: assigns,
		Settings:    constraints.DefaultSettings(),
	}

	// Warm-up + measure
	for i := 0; i < 3; i++ {
		_ = constraints.Compute(state)
	}
	const iters = 10
	start := time.Now()
	var lastN int
	for i := 0; i < iters; i++ {
		ws := constraints.Compute(state)
		lastN = len(ws)
	}
	avg := time.Since(start) / iters

	fmt.Printf("volunteers=%d missions=%d assignments=%d warnings=%d avg=%v\n",
		nVols, nMissions, nAssigns, lastN, avg)
	if avg > time.Duration(budgetMs)*time.Millisecond {
		fmt.Fprintf(os.Stderr, "BUDGET EXCEEDED: avg=%v > %dms\n", avg, budgetMs)
		os.Exit(1)
	}
}
