// Package event owns the singleton event row (id=1) created by the first-run wizard.
package event

type Event struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	StartDate   string `json:"start_date"`
	EndDate     string `json:"end_date"`
	Timezone    string `json:"timezone"`
	CountryCode string `json:"country_code"`
	Settings    string `json:"settings"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}
