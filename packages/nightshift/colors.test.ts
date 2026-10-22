// a color token's channels read from its hex or rgba value, and any other value throws an error
import { expect, test } from "bun:test"
import { toColorChannels } from "./colors"

test("toColorChannels reads a six-digit hex color with an alpha of 1", () => {
	expect(toColorChannels("#8f4c17")).toEqual({ channels: [143, 76, 23], alpha: 1 })
})

test("toColorChannels reads an rgba color with its alpha", () => {
	expect(toColorChannels("rgba(120, 96, 72, 0.18)")).toEqual({ channels: [120, 96, 72], alpha: 0.18 })
})

test("toColorChannels throws an error for a color in another form or out of range", () => {
	// a short hex, a named color, a channel past 255, and an alpha past 1
	for (const colorValue of ["#fff", "orange", "rgba(999, 0, 0, 1)", "rgba(0, 0, 0, 1.2)"]) {
		expect(() => toColorChannels(colorValue)).toThrow()
	}
})
