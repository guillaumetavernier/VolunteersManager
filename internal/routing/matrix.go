package routing

import (
	"context"
	"database/sql"
)

// Mode constants.
const (
	ModeDrive = "drive"
	ModeWalk  = "walk"
)

// Source constants used in travel_times.source.
const (
	SourceAuto     = "auto"
	SourceManual   = "manual"
	SourceFallback = "fallback"
)

// Cell is one row of travel_times.
type Cell struct {
	FromVS  int64  `json:"from_vs"`
	ToVS    int64  `json:"to_vs"`
	Mode    string `json:"mode"`
	Seconds int    `json:"seconds"`
	Source  string `json:"source"`
}

// ListCells reads the entire travel_times table.
func ListCells(ctx context.Context, db *sql.DB) ([]Cell, error) {
	rows, err := db.QueryContext(ctx, `SELECT from_vs_id, to_vs_id, mode, seconds, source FROM travel_times`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []Cell
	for rows.Next() {
		var c Cell
		if err := rows.Scan(&c.FromVS, &c.ToVS, &c.Mode, &c.Seconds, &c.Source); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// LoadVS returns the minimal VS projection needed for matrix work.
func LoadVS(ctx context.Context, db *sql.DB) ([]VS, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, lat, lon FROM vs ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []VS
	for rows.Next() {
		var v VS
		if err := rows.Scan(&v.ID, &v.Lat, &v.Lon); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// RecomputeMatrix fills missing cells with values from the provider and
// preserves source='manual' rows untouched. Existing 'auto' or 'fallback' rows
// are overwritten so a VS move updates them. Cells whose endpoints no longer
// exist are pruned via ON DELETE CASCADE from the VS row deletion itself; this
// function does not delete those.
func RecomputeMatrix(ctx context.Context, db *sql.DB, vs []VS, p Provider) error {
	existing, err := ListCells(ctx, db)
	if err != nil {
		return err
	}
	type key struct {
		from, to int64
		mode     string
	}
	have := make(map[key]Cell, len(existing))
	for _, c := range existing {
		have[key{c.FromVS, c.ToVS, c.Mode}] = c
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	const upsert = `INSERT INTO travel_times (from_vs_id, to_vs_id, mode, seconds, source, updated_at)
	                VALUES (?, ?, ?, ?, ?, datetime('now'))
	                ON CONFLICT(from_vs_id, to_vs_id, mode) DO UPDATE SET
	                  seconds = excluded.seconds,
	                  source  = excluded.source,
	                  updated_at = datetime('now')
	                WHERE travel_times.source != 'manual'`

	for _, a := range vs {
		for _, b := range vs {
			for _, mode := range []string{ModeDrive, ModeWalk} {
				k := key{a.ID, b.ID, mode}
				cur, ok := have[k]
				if ok && cur.Source == SourceManual {
					continue
				}
				sec := p.Seconds(a, b, mode)
				if _, err := tx.ExecContext(ctx, upsert, a.ID, b.ID, mode, sec, p.Source()); err != nil {
					return err
				}
			}
		}
	}
	return tx.Commit()
}

// SetManual writes an explicit cell value with source='manual'. Used by the
// PATCH /api/travel-times endpoint.
func SetManual(ctx context.Context, db *sql.DB, fromVS, toVS int64, mode string, seconds int) error {
	const q = `INSERT INTO travel_times (from_vs_id, to_vs_id, mode, seconds, source, updated_at)
	           VALUES (?, ?, ?, ?, 'manual', datetime('now'))
	           ON CONFLICT(from_vs_id, to_vs_id, mode) DO UPDATE SET
	             seconds = excluded.seconds,
	             source  = 'manual',
	             updated_at = datetime('now')`
	_, err := db.ExecContext(ctx, q, fromVS, toVS, mode, seconds)
	return err
}
