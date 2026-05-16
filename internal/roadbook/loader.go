package roadbook

import (
	"context"
	"database/sql"
	"sort"

	"github.com/guillaumetavernier/volunteersmanager/internal/domain/constraints"
	"github.com/guillaumetavernier/volunteersmanager/internal/features/event"
)

// LoadEventState reads everything the roadbook renderer needs from the DB.
// Re-uses constraints.LoadState for the engine-relevant subset and adds the
// extra read-only projections the PDF templates display (full names, VS
// metadata, coordinator/event headers).
func LoadEventState(ctx context.Context, db *sql.DB, ev event.Event) (EventState, error) {
	engineState, err := constraints.LoadState(ctx, db)
	if err != nil {
		return EventState{}, err
	}
	state := EventState{
		Engine:        engineState,
		EventName:     ev.Name,
		StartDate:     ev.StartDate,
		EndDate:       ev.EndDate,
		VolunteerByID: map[int64]VolunteerProfile{},
		MissionByID:   map[int64]MissionMeta{},
		VSByID:        map[int64]VSReference{},
	}
	if ev.LogoPath != nil {
		state.LogoPath = *ev.LogoPath
	}
	if ev.SponsorPath != nil {
		state.SponsorPath = *ev.SponsorPath
	}
	if ev.CoordinatorName != nil {
		state.CoordName = *ev.CoordinatorName
	}
	if ev.CoordinatorPhone != nil {
		state.CoordPhone = *ev.CoordinatorPhone
	}

	// Full volunteer projection.
	vrows, err := db.QueryContext(ctx, `SELECT id, first_name, last_name, phone,
		COALESCE(email,''), COALESCE(emergency_contact_name,''), COALESCE(emergency_contact_phone,''),
		COALESCE(general_info,''), COALESCE(customizable_message,''), COALESCE(default_vs_id, 0),
		archived
		FROM volunteers ORDER BY id`)
	if err != nil {
		return state, err
	}
	for vrows.Next() {
		var p VolunteerProfile
		var archivedInt int
		if err := vrows.Scan(&p.ID, &p.FirstName, &p.LastName, &p.Phone,
			&p.Email, &p.EmergencyName, &p.EmergencyPhone,
			&p.GeneralInfo, &p.CustomizableMessage, &p.DefaultVSID, &archivedInt); err != nil {
			_ = vrows.Close()
			return state, err
		}
		p.Archived = archivedInt != 0
		state.VolunteerByID[p.ID] = p
		if !p.Archived {
			state.VolunteerIDs = append(state.VolunteerIDs, p.ID)
		}
	}
	if err := vrows.Err(); err != nil {
		_ = vrows.Close()
		return state, err
	}
	_ = vrows.Close()
	sort.Slice(state.VolunteerIDs, func(i, j int) bool { return state.VolunteerIDs[i] < state.VolunteerIDs[j] })

	// VS reference table.
	vsRows, err := db.QueryContext(ctx, `SELECT id, name, lat, lon,
		COALESCE(notes,''), COALESCE(what3words,'')
		FROM vs ORDER BY id`)
	if err != nil {
		return state, err
	}
	for vsRows.Next() {
		var ref VSReference
		if err := vsRows.Scan(&ref.ID, &ref.Name, &ref.Lat, &ref.Lon, &ref.Notes, &ref.What3Words); err != nil {
			_ = vsRows.Close()
			return state, err
		}
		state.VSByID[ref.ID] = ref
		state.References = append(state.References, ref)
	}
	if err := vsRows.Err(); err != nil {
		_ = vsRows.Close()
		return state, err
	}
	_ = vsRows.Close()

	// Mission projection (title + vs name).
	mRows, err := db.QueryContext(ctx, `SELECT m.id, m.vs_id, COALESCE(v.name,''), m.day, m.start_time, m.end_time, m.role_type, COALESCE(m.title,'')
		FROM missions m LEFT JOIN vs v ON v.id = m.vs_id ORDER BY m.id`)
	if err != nil {
		return state, err
	}
	for mRows.Next() {
		var m MissionMeta
		if err := mRows.Scan(&m.ID, &m.VSID, &m.VSName, &m.Day, &m.Start, &m.End, &m.RoleType, &m.Title); err != nil {
			_ = mRows.Close()
			return state, err
		}
		state.MissionByID[m.ID] = m
	}
	if err := mRows.Err(); err != nil {
		_ = mRows.Close()
		return state, err
	}
	_ = mRows.Close()

	return state, nil
}
