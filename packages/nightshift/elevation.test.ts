// the raised shadow's utility writes both shadows in order
import { expect, test } from "bun:test"
import { toRaisedShadowUtilityCss } from "./elevation"

test("the raised shadow's utility writes both shadows", () => {
	expect(toRaisedShadowUtilityCss()).toContain(
		"box-shadow: 0px 2px 5px 0px rgba(0, 0, 0, 0.2), 0px 8px 15px -6px rgba(0, 0, 0, 0.34);",
	)
})
