// the places of one item and format a map shows: every place is its own pin at its finest known level, a postal code,
// then a city, then a country
import { COUNTRY_CENTERS } from "@carlnotes/contracts/countryCenters"
import type { DashboardPin, Place } from "@carlnotes/contracts/dashboards"
import { type DashboardCount, toDashboardCountFields } from "@carlnotes/core/lib/dashboardCounts"

// one place's distinct people and its views or plays, for one item and format
export type PlaceCount = DashboardCount & { place: Place; peopleCount: number }

// a place the map shows, with its distinct people and its views or plays
export type ShownPlace = Omit<DashboardPin, "items">

/**
 * Returns the places one item and format shows, one pin per place with any number of people. A place sits at
 * Cloudflare's coordinates if it has them, else at its country's center.
 */
export function toShownPlaces(placeCounts: PlaceCount[]): ShownPlace[] {
	return placeCounts.map(toShownPlace)
}

// one place at Cloudflare's coordinates, or at its country's center if Cloudflare sent none
function toShownPlace(placeCount: PlaceCount): ShownPlace {
	const { place, peopleCount } = placeCount
	const [latitude, longitude] =
		place.latitude !== null && place.longitude !== null
			? [Number(place.latitude), Number(place.longitude)]
			: (COUNTRY_CENTERS[place.country] ?? [null, null])
	return {
		placeLevel: place.city !== null || place.postalCode !== null ? "city" : "country",
		country: place.country,
		region: place.region,
		city: place.city,
		postalCode: place.postalCode,
		latitude,
		longitude,
		peopleCount,
		...toDashboardCountFields(placeCount),
	}
}
