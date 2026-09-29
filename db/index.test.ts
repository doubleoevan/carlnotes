// a pool setting read from the environment: its value if it is a whole number above zero, and the default otherwise
import { expect, test } from "bun:test"
import { toPositiveInteger } from "./index"

// unset and empty keep the default, a whole number is used as is, and a word, zero, a negative, or a fraction keeps the default
test("an unset, a valid, and an unreadable value give the default or the value", () => {
	const expectedValues: [string | undefined, number][] = [
		[undefined, 40],
		["", 40],
		["12", 12],
		["forty", 40],
		["0", 40],
		["-5", 40],
		["2.5", 40],
	]
	for (const [value, expectedValue] of expectedValues) {
		expect(toPositiveInteger(value, 40)).toBe(expectedValue)
	}
})
