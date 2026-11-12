// shown places tests: a lone town rolls into its country, a 12-and-3 country shows no city, and a place with no
// city never gets a city pin

import { expect, test } from "bun:test"
import { COUNTRY_CENTERS } from "@carlnotes/contracts/countryCenters"
import { ZURICH_PLACE } from "@carlnotes/contracts/placeTestFixtures"
import { type PlaceCount, toShownPlaces } from "./shownPlaces"

// a Swiss city's place count with the given people, and twice as many views
function toSwissCity(city: string, peopleCount: number): PlaceCount {
	const place = { ...ZURICH_PLACE, city }
	return { place, peopleCount, count: peopleCount * 2 }
}

test("a lone town under ten people rolls into its country's pin at the country's center", () => {
	expect(toShownPlaces([toSwissCity("Hinwil", 3)])).toEqual([
		{
			placeLevel: "country",
			country: "CH",
			region: null,
			city: null,
			latitude: COUNTRY_CENTERS.CH?.[0] ?? null,
			longitude: COUNTRY_CENTERS.CH?.[1] ?? null,
			peopleCount: 3,
			count: 6,
		},
	])
})

test("a 12-and-3 country rolls the 12 in too, so the 3 cannot be found by subtraction", () => {
	const shownPlaces = toShownPlaces([toSwissCity("Zürich", 12), toSwissCity("Hinwil", 3)])
	expect(shownPlaces.map(({ placeLevel, peopleCount }) => [placeLevel, peopleCount])).toEqual([["country", 15]])
})

test("cities of ten or more show beside a remainder of ten or more, and an exact split shows no remainder", () => {
	const withRemainder = toShownPlaces([toSwissCity("Zürich", 40), toSwissCity("Bern", 25), toSwissCity("Hinwil", 11)])
	expect(withRemainder.map(({ city, peopleCount }) => [city, peopleCount])).toEqual([
		["Hinwil", 11],
		["Bern", 25],
		["Zürich", 40],
	])

	// two small towns make a remainder of ten, which shows beside the big city
	const smallTowns = [toSwissCity("Hinwil", 4), toSwissCity("Uster", 6)]
	const withTowns = toShownPlaces([toSwissCity("Zürich", 40), ...smallTowns])
	expect(withTowns.map(({ placeLevel, peopleCount }) => [placeLevel, peopleCount])).toEqual([
		["city", 40],
		["country", 10],
	])
})

test("a place with no city or no center counts toward its country and never pins a city", () => {
	const noCity = {
		place: { country: "FR", region: null, city: null, latitude: null, longitude: null },
		peopleCount: 30,
	}
	const shownPlaces = toShownPlaces([{ ...noCity, count: 30 }])
	expect(shownPlaces.map(({ placeLevel, country }) => [placeLevel, country])).toEqual([["country", "FR"]])
})
