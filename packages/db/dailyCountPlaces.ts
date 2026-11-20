// the place of a daily count row: its key, its columns, and the place its columns name
import { createHash } from "node:crypto"
import type { Place } from "@carlnotes/contracts/dashboards"

// a daily count row's place columns, all null for a row with no known place
export type PlaceColumns = Record<keyof Place, string | null>

// the place key of a view or play with no known place
const UNKNOWN_PLACE_KEY = "unknown"

/**
 * Returns the key that names a place in a daily count row: a hash of its values, or unknown for no place. A place with
 * no postal or metro code hashes its first five values alone, so it keeps the key it had before those codes were read.
 */
export function toPlaceKey(place: Place | null): string {
	if (!place) {
		return UNKNOWN_PLACE_KEY
	}

	// hash the place's values, with its codes only if it has one
	const { country, region, city, postalCode, metroCode, latitude, longitude } = place
	const placeCodes = postalCode === null && metroCode === null ? [] : [postalCode, metroCode]
	const placeValues = JSON.stringify([country, region, city, latitude, longitude, ...placeCodes])
	return createHash("sha256").update(placeValues).digest("hex").slice(0, 32)
}

/**
 * Returns a place's daily count columns, all null for no place.
 */
export function toPlaceColumns(place: Place | null): PlaceColumns {
	return (
		place ?? {
			country: null,
			region: null,
			city: null,
			postalCode: null,
			metroCode: null,
			latitude: null,
			longitude: null,
		}
	)
}

/**
 * Returns the place a daily count row's columns name, or null for a row with no known country.
 */
export function toDailyCountPlace(placeColumns: PlaceColumns): Place | null {
	const { country, region, city, postalCode, metroCode, latitude, longitude } = placeColumns
	return country ? { country, region, city, postalCode, metroCode, latitude, longitude } : null
}
