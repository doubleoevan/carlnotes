// tests for updating the featured topics ordering
import { describe, expect, test } from "bun:test"
import { toTargetPosition } from "./featuring"

describe("the position a ranked topic takes", () => {
	test("a topic joining an ordering it was not in takes the position offered", () => {
		// three featured topics, so the control offers 1 through 4 and none of them is past the end
		expect(toTargetPosition(1, 3)).toBe(1)
		expect(toTargetPosition(2, 3)).toBe(2)
		expect(toTargetPosition(4, 3)).toBe(4)
	})

	test("a topic already featured appends to the end instead of past it", () => {
		// the control offered 4 against four featured topics, and the topic has since left the ordering,
		// so the three that remain make 4 the end. taking 5 would leave a gap where it used to be
		expect(toTargetPosition(4, 3)).toBe(4)
		expect(toTargetPosition(5, 3)).toBe(4)
	})

	test("the first featured topic takes position one", () => {
		expect(toTargetPosition(1, 0)).toBe(1)
	})
})
