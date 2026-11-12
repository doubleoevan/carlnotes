// which places of one item and format a map may show. a city shows on its own only with at least the city minimum of
// distinct people, and every smaller group rolls into its country's pin, which sits at the country's center
import { COUNTRY_CENTERS } from "@carlnotes/contracts/countryCenters"
import { CITY_MINIMUM_PEOPLE, type DashboardPin, type Place } from "@carlnotes/contracts/dashboards"
import {
	type DashboardCount,
	sumDashboardCounts,
	sumPeopleCounts,
	toDashboardCountFields,
} from "@carlnotes/core/lib/dashboardCounts"
import { groupBy } from "@carlnotes/core/lib/groupBy"

// one place's distinct people and its views or plays, for one item and format
export type PlaceCount = DashboardCount & { place: Place; peopleCount: number }

// a place the map may show: a city at Cloudflare's city center, or a country's remainder at the country's center, with
// its distinct people and its views or plays
export type ShownPlace = Omit<DashboardPin, "items">

/**
 * Returns the places one item and format may show. A city under the city minimum rolls into its country. While the
 * country's remainder holds people but fewer than the city minimum, the smallest shown city rolls in too, so no city
 * can be found by subtracting the shown cities from the country.
 */
export function toShownPlaces(placeCounts: PlaceCount[]): ShownPlace[] {
	// group the places by country, then find each country's shown places
	const placeCountsByCountry = groupBy(placeCounts, ({ place }) => place.country)
	return [...placeCountsByCountry.entries()].flatMap(([country, countryPlaceCounts]) =>
		toShownCountryPlaces(country, countryPlaceCounts),
	)
}

// one country's shown cities and its remainder
function toShownCountryPlaces(country: string, countryPlaceCounts: PlaceCount[]): ShownPlace[] {
	// a city with a center and enough people shows, smallest first, and everything else is the remainder
	const shownCities = countryPlaceCounts
		.filter(({ place, peopleCount }) => isPinnableCity(place) && peopleCount >= CITY_MINIMUM_PEOPLE)
		.sort((first, second) => first.peopleCount - second.peopleCount)
	const remainder = countryPlaceCounts.filter((placeCount) => !shownCities.includes(placeCount))

	// roll the smallest shown city into the remainder while the remainder is small enough to point at one city.
	// ponytail: people are summed across places, so a person in two hidden cities counts twice. merge the sketches if
	// the remainder needs to be exact
	while (shownCities.length > 0 && isSmallRemainder(remainder)) {
		remainder.push(...shownCities.splice(0, 1))
	}

	// the shown cities, then the country's remainder if anyone is in it
	const shownCityPlaces = shownCities.map(toShownCity)
	const remainderPeopleCount = sumPeopleCounts(remainder)
	if (remainderPeopleCount === 0) {
		return shownCityPlaces
	}
	const [latitude, longitude] = COUNTRY_CENTERS[country] ?? [null, null]
	return [
		...shownCityPlaces,
		{
			placeLevel: "country",
			country,
			region: null,
			city: null,
			latitude,
			longitude,
			peopleCount: remainderPeopleCount,
			...sumDashboardCounts(remainder),
		},
	]
}

// whether a place names a city with Cloudflare's city center, which a city pin needs
function isPinnableCity(place: Place): boolean {
	return place.city !== null && place.latitude !== null && place.longitude !== null
}

// whether a remainder holds people but fewer than the city minimum
function isSmallRemainder(remainder: PlaceCount[]): boolean {
	const remainderPeopleCount = sumPeopleCounts(remainder)
	return remainderPeopleCount > 0 && remainderPeopleCount < CITY_MINIMUM_PEOPLE
}

// a shown city at Cloudflare's city center
function toShownCity(placeCount: PlaceCount): ShownPlace {
	const { place, peopleCount } = placeCount
	return {
		placeLevel: "city",
		country: place.country,
		region: place.region,
		city: place.city,
		latitude: Number(place.latitude),
		longitude: Number(place.longitude),
		peopleCount,
		...toDashboardCountFields(placeCount),
	}
}
