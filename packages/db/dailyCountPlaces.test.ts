// daily count place tests: the place key
import { expect, test } from "bun:test"
import { ZURICH_PLACE } from "@carlnotes/contracts/placeTestFixtures"
import { toPlaceKey } from "./dailyCountPlaces"

test("a place key is the same for the same place and unknown for none", () => {
	expect(toPlaceKey(ZURICH_PLACE)).toBe(toPlaceKey({ ...ZURICH_PLACE }))
	expect(toPlaceKey({ ...ZURICH_PLACE, city: "Winterthur" })).not.toBe(toPlaceKey(ZURICH_PLACE))
	expect(toPlaceKey(null)).toBe("unknown")
})
