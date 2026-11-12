// the Dashboard map: its box and starting place, and its pins, nearby places grouped into one pin at a zoom, each pin's
// size, label, focused point, and the box a click zooms to. web and mobile draw the same pins

import { toCountryName } from "@carlnotes/contracts/countryNames"
import type { DashboardPin } from "@carlnotes/contracts/dashboards"
import type { DashboardPoint } from "./dashboardCharts"
import { sumDashboardCounts, sumPeopleCounts, toDashboardCountFields } from "./dashboardCounts"
import { groupBy } from "./groupBy"

// the map's box, three wide by two high up to its largest height in pixels, and where it starts, the whole world
export const DASHBOARD_MAP_BOX = { aspectRatio: 3 / 2, maxHeight: 440 }
export const DASHBOARD_MAP_CENTER = { latitude: 20, longitude: 0 }

// the space in pixels a zoom to a pin's places keeps around them, and the world's width in pixels at zoom 0
export const DASHBOARD_MAP_ZOOM_PADDING = 48
export const WORLD_TILE_SIZE = 256

// how close two places sit on the map, in pixels, before they share one pin
const DASHBOARD_PIN_RADIUS = 40

// the smallest and largest pin sizes in pixels, the smallest wide enough for its count
const MIN_PIN_SIZE = 24
const MAX_PIN_SIZE = 44

// the box a pin's places span, which a click zooms the map to
export type DashboardMapBounds = { north: number; south: number; east: number; west: number }

// one pin the map draws: its key, where it sits, its size in pixels by its people, its count's label, its focused
// point, and the box its places span, or null for one place, whose click opens its detail
export type DashboardMapPin = {
	key: string
	// where it sits and how large it draws
	latitude: number
	longitude: number
	size: number
	// what it shows and where a click goes
	label: string
	point: DashboardPoint
	zoomBounds: DashboardMapBounds | null
}

// a pin at its place on the map, with its place in pixels at the zoom
type PlacedPin = { pin: DashboardPin; latitude: number; longitude: number; x: number; y: number }

// the places that share one pin, led by the largest
type PlacedPinGroup = [PlacedPin, ...PlacedPin[]]

// the grid cells around a place's own cell, and the cell itself
const NEARBY_CELL_OFFSETS = [-1, 0, 1].flatMap((offsetX) => [-1, 0, 1].map((offsetY) => [offsetX, offsetY] as const))

/**
 * Returns the pins a map draws at a zoom: each place joins the largest place within the pin radius on the screen, so
 * one pin sums the counts and items of the places it holds and sits at the largest one. Each pin's size follows its
 * people against the most in one pin. A pin sits at its stored place, a city's own or a country remainder's country
 * center, and a pin with no stored place is left out.
 */
export function toDashboardMapPins(pins: DashboardPin[], zoom: number): DashboardMapPin[] {
	// each pin at its place in pixels, largest first so the largest place leads its group
	const worldSize = WORLD_TILE_SIZE * 2 ** zoom
	const placedPins = pins
		.flatMap((pin): PlacedPin[] => {
			// a pin with no stored place is left out
			const { latitude, longitude } = pin
			return latitude === null || longitude === null
				? []
				: [{ pin, latitude, longitude, ...toWorldPixels(latitude, longitude, worldSize) }]
		})
		.sort((first, second) => second.pin.peopleCount - first.pin.peopleCount)

	// each group's pin, sized by its people against the most in one group
	const peopleGroups = toPlacedPinGroups(placedPins).map((group) => ({
		group,
		peopleCount: sumPeopleCounts(group.map(({ pin }) => pin)),
	}))
	const mostPeopleCount = Math.max(1, ...peopleGroups.map(({ peopleCount }) => peopleCount))
	return peopleGroups.map(({ group, peopleCount }) => toGroupPin(group, toPinSize(peopleCount, mostPeopleCount)))
}

// a place in pixels on the Web Mercator world at a width, the projection Google and Apple maps draw
function toWorldPixels(latitude: number, longitude: number, worldSize: number): { x: number; y: number } {
	const sine = Math.min(Math.max(Math.sin((latitude * Math.PI) / 180), -0.9999), 0.9999)
	return {
		x: ((longitude + 180) / 360) * worldSize,
		y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * worldSize,
	}
}

// each place joins the first group whose leader sits within the pin radius, else leads its own group. each leader is
// kept in a grid cell one radius wide, so a place checks only the leaders in its own cell and the eight around it
function toPlacedPinGroups(placedPins: PlacedPin[]): PlacedPinGroup[] {
	// the groups in the order their leaders came, and each leader's group by its grid cell
	const groups: PlacedPinGroup[] = []
	const groupIndexesByCell = new Map<string, number[]>()
	for (const placedPin of placedPins) {
		// the first group whose leader sits within the radius
		const cellX = Math.floor(placedPin.x / DASHBOARD_PIN_RADIUS)
		const cellY = Math.floor(placedPin.y / DASHBOARD_PIN_RADIUS)
		const nearbyGroupIndexes = NEARBY_CELL_OFFSETS.flatMap(
			([offsetX, offsetY]) => groupIndexesByCell.get(`${cellX + offsetX}|${cellY + offsetY}`) ?? [],
		)
		const nearbyGroups = nearbyGroupIndexes.sort((first, second) => first - second).map((index) => groups[index])
		const joinedGroup = nearbyGroups.find((group) => group && isWithinPinRadius(group[0], placedPin))

		// join that group, else lead a new group from the place's own cell
		if (joinedGroup) {
			joinedGroup.push(placedPin)
			continue
		}
		const cellKey = `${cellX}|${cellY}`
		groupIndexesByCell.set(cellKey, [...(groupIndexesByCell.get(cellKey) ?? []), groups.length])
		groups.push([placedPin])
	}

	return groups
}

// whether a place sits within the pin radius of a group's leader
function isWithinPinRadius(leader: PlacedPin, placedPin: PlacedPin): boolean {
	return Math.hypot(leader.x - placedPin.x, leader.y - placedPin.y) <= DASHBOARD_PIN_RADIUS
}

// a pin's size by the square root of its people's share of the most in one pin, between the smallest and largest
function toPinSize(peopleCount: number, mostPeopleCount: number): number {
	return MIN_PIN_SIZE + (MAX_PIN_SIZE - MIN_PIN_SIZE) * Math.sqrt(peopleCount / mostPeopleCount)
}

// a group's pin at its leader's place: one place keeps its own title, and a group sums its places
function toGroupPin(group: PlacedPinGroup, size: number): DashboardMapPin {
	// the group's counts and items summed, titled by its country if it has one, else by its count of places
	const [leader] = group
	const groupPins = group.map(({ pin }) => pin)
	const countries = new Set(groupPins.map((pin) => pin.country))
	const countryName = toCountryName(leader.pin.country) ?? leader.pin.country
	const point =
		group.length === 1
			? toPinPoint(leader.pin, countryName)
			: {
					title: countries.size === 1 ? countryName : `${group.length} places`,
					path: null,
					counts: sumDashboardCounts(groupPins),
					items: toSummedItems(groupPins),
				}

	// the box the group's places span, or none if they all sit at one place. the label is the count, as the detail's
	// total is
	const latitudes = group.map(({ latitude }) => latitude)
	const longitudes = group.map(({ longitude }) => longitude)
	const zoomBounds = {
		north: Math.max(...latitudes),
		south: Math.min(...latitudes),
		east: Math.max(...longitudes),
		west: Math.min(...longitudes),
	}
	const isOnePlace = zoomBounds.north === zoomBounds.south && zoomBounds.east === zoomBounds.west
	return {
		key: [leader.pin.placeLevel, leader.pin.country, leader.pin.region, leader.pin.city].join("|"),
		latitude: leader.latitude,
		longitude: leader.longitude,
		size,
		label: toPinLabel(point.counts.count),
		point,
		zoomBounds: isOnePlace ? null : zoomBounds,
	}
}

// a pin as a focused point: its city or country, its counts, and the items there
function toPinPoint(pin: DashboardPin, countryName: string): DashboardPoint {
	const placeTitle = pin.placeLevel === "city" && pin.city ? `${pin.city}, ${countryName}` : countryName
	return { title: placeTitle, path: null, counts: toDashboardCountFields(pin), items: pin.items }
}

// each item's entries across the pins, summed
function toSummedItems(pins: DashboardPin[]): DashboardPin["items"] {
	const itemEntriesByItem = groupBy(
		pins.flatMap((pin) => pin.items),
		(item) => item.itemId,
	)
	return [...itemEntriesByItem.values()].map((itemEntries) => {
		const [{ itemId, title, path }] = itemEntries
		return { itemId, title, path, ...sumDashboardCounts(itemEntries) }
	})
}

// a pin's count as its label, with thousands shortened to k so it fits in the pin
function toPinLabel(count: number): string {
	if (count < 1000) {
		return String(count)
	}
	return count < 10_000 ? `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${Math.round(count / 1000)}k`
}
