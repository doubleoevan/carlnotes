// shown places tests: every place pins on its own with any number of people, at Cloudflare's coordinates or else at
// its country's center

import { expect, test } from "bun:test"
import { COUNTRY_CENTERS } from "@carlnotes/contracts/countryCenters"
import { ZURICH_PLACE } from "@carlnotes/contracts/placeTestFixtures"
import { type PlaceCount, toShownPlaces } from "./shownPlaces"

// a Swiss place count in a city and postal code with the given people, and twice as many views
function toSwissPlace(city: string, postalCode: string, peopleCount: number): PlaceCount {
	const place = { ...ZURICH_PLACE, city, postalCode }
	return { place, peopleCount, count: peopleCount * 2 }
}

test("a lone person in a small town pins at the town's own postal code and coordinates", () => {
	expect(toShownPlaces([toSwissPlace("Hinwil", "8340", 1)])).toEqual([
		{
			placeLevel: "city",
			country: "CH",
			region: "Zurich",
			city: "Hinwil",
			postalCode: "8340",
			latitude: 47.36667,
			longitude: 8.55,
			peopleCount: 1,
			count: 2,
		},
	])
})

test("two postal codes in one city pin separately, and nothing rolls into the country", () => {
	const shownPlaces = toShownPlaces([
		toSwissPlace("Zürich", "8001", 12),
		toSwissPlace("Zürich", "8004", 3),
		toSwissPlace("Uster", "8610", 1),
	])
	expect(shownPlaces.map(({ city, postalCode, peopleCount }) => [city, postalCode, peopleCount])).toEqual([
		["Zürich", "8001", 12],
		["Zürich", "8004", 3],
		["Uster", "8610", 1],
	])
})

test("a place with no coordinates pins at its country's center, as a city if it names one", () => {
	const noCoordinates = { latitude: null, longitude: null }
	const cityPlace = { ...ZURICH_PLACE, ...noCoordinates }
	const countryPlace = { ...ZURICH_PLACE, ...noCoordinates, region: null, city: null, postalCode: null }
	const shownPlaces = toShownPlaces([
		{ place: cityPlace, peopleCount: 2, count: 2 },
		{ place: countryPlace, peopleCount: 1, count: 1 },
	])
	const [centerLatitude, centerLongitude] = COUNTRY_CENTERS.CH ?? [null, null]
	expect(
		shownPlaces.map(({ placeLevel, city, latitude, longitude }) => [placeLevel, city, latitude, longitude]),
	).toEqual([
		["city", "Zürich", centerLatitude, centerLongitude],
		["country", null, centerLatitude, centerLongitude],
	])
})
