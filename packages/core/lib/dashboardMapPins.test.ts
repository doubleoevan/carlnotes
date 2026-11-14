// the Dashboard map's pins: nearby places grouped into one pin, each pin's size, and a zoom in that splits them
import { expect, test } from "bun:test"
import type { DashboardPin } from "@carlnotes/contracts/dashboards"
import { toDashboardMapPins } from "./dashboardMapPins"

test("nearby places share one pin with their visits summed, sized by their people, and a zoom in splits them", () => {
	// a Paris pin and a France pin with no city at France's center sharing one Topic Post, and a pin with no stored place
	const topicPost = { itemId: "post-1", title: "Roasting", path: "/p/1" }
	const pins: DashboardPin[] = [
		{
			placeLevel: "city",
			country: "FR",
			region: "Ile-de-France",
			city: "Paris",
			latitude: 48.86,
			longitude: 2.35,
			peopleCount: 12,
			count: 15,
			items: [{ ...topicPost, count: 15 }],
		},
		{
			placeLevel: "country",
			country: "FR",
			region: null,
			city: null,
			latitude: 46.23,
			longitude: 2.21,
			peopleCount: 3,
			count: 4,
			items: [{ ...topicPost, count: 4 }],
		},
		{
			...{ placeLevel: "country", country: "ZZ", region: null, city: null, latitude: null, longitude: null },
			peopleCount: 1,
			count: 1,
			items: [],
		},
	]

	// zoomed out Paris and the France pin share one pin at Paris, titled France, at the largest size, with the visits and
	// the Topic Post's visits summed and the box they span to zoom to
	const [francePin, ...otherPins] = toDashboardMapPins(pins, 2)
	expect(otherPins).toEqual([])
	expect(francePin).toMatchObject({
		latitude: 48.86,
		size: 44,
		label: "19",
		zoomBounds: { north: 48.86, south: 46.23 },
	})
	expect([francePin?.point.title, francePin?.point.counts.count, francePin?.point.items?.[0]?.count]).toEqual([
		"France",
		19,
		19,
	])

	// zoomed in each place has its own pin, sized by the square root of its people's share, with no box, so a click
	// opens its detail
	const placePins = toDashboardMapPins(pins, 7)
	expect(placePins.map(({ point, size, label, zoomBounds }) => [point.title, size, label, zoomBounds])).toEqual([
		["Paris, France", 44, "15", null],
		["France", 34, "4", null],
	])
})

test("a place joins a pin only within the radius of the pin's largest place, never through a nearer place", () => {
	// three places in a row on the equator, about 34 pixels apart at zoom 2 inside the 40 pixel radius
	const toEquatorPin = (city: string, longitude: number, peopleCount: number): DashboardPin => ({
		...{ placeLevel: "city", country: "BR", region: null, city, latitude: 0, longitude },
		peopleCount,
		count: peopleCount,
		items: [],
	})
	const pins = [toEquatorPin("West", 0, 10), toEquatorPin("Middle", 12, 5), toEquatorPin("East", 24, 1)]

	// the middle place joins the west one, and the east one sits too far from the west one to join it
	const mapPins = toDashboardMapPins(pins, 2)
	expect(mapPins.map(({ point, label }) => [point.title, label])).toEqual([
		["Brazil", "15"],
		["East, Brazil", "1"],
	])
})

test("two postal codes of one city at one spot share a pin titled by the city", () => {
	// two Zürich postal codes, each with one person, at the coordinates Cloudflare gives both
	const zurichPin = {
		placeLevel: "city",
		country: "CH",
		region: "Zurich",
		city: "Zürich",
		latitude: 47.37,
		longitude: 8.55,
	}
	const pins: DashboardPin[] = [
		{ ...zurichPin, placeLevel: "city", postalCode: "8001", peopleCount: 1, count: 1, items: [] },
		{ ...zurichPin, placeLevel: "city", postalCode: "8004", peopleCount: 1, count: 2, items: [] },
	]
	const [sharedPin, ...otherPins] = toDashboardMapPins(pins, 12)
	expect(otherPins).toEqual([])
	expect([sharedPin?.point.title, sharedPin?.label, sharedPin?.zoomBounds]).toEqual(["Zürich, Switzerland", "3", null])
})
