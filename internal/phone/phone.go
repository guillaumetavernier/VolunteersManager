// Package phone wraps phonenumbers parsing for the one shape the app cares
// about: "give me an E.164 string, or fail."
package phone

import (
	"strings"

	"github.com/nyaruka/phonenumbers"
)

// Normalize returns the E.164 representation of phone, using country (ISO
// alpha-2) as the fallback when no "+" prefix is present. Returns "", false
// when parsing fails or the parsed number is not valid.
func Normalize(phone, country string) (string, bool) {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return "", false
	}
	if country == "" {
		country = "FR"
	}
	num, err := phonenumbers.Parse(phone, strings.ToUpper(country))
	if err != nil {
		return "", false
	}
	if !phonenumbers.IsValidNumber(num) {
		return "", false
	}
	return phonenumbers.Format(num, phonenumbers.E164), true
}
