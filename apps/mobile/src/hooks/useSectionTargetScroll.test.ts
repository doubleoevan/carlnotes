// a row counts as shown once half of it is inside the window
import { expect, test } from "bun:test"
import { isHalfInWindow } from "./useSectionTargetScroll"

test("a row is shown once at least half of its height is inside the window", () => {
	// a row inside the window, and rows half past its bottom and its top
	expect(isHalfInWindow({ y: 100, height: 80, windowHeight: 800 })).toBe(true)
	expect(isHalfInWindow({ y: 760, height: 80, windowHeight: 800 })).toBe(true)
	expect(isHalfInWindow({ y: -40, height: 80, windowHeight: 800 })).toBe(true)

	// a row mostly below the window, one above it, and one not laid out yet
	expect(isHalfInWindow({ y: 770, height: 80, windowHeight: 800 })).toBe(false)
	expect(isHalfInWindow({ y: -200, height: 80, windowHeight: 800 })).toBe(false)
	expect(isHalfInWindow({ y: 100, height: 0, windowHeight: 800 })).toBe(false)
})

test("a row taller than the window is shown while it fills half of its own height", () => {
	expect(isHalfInWindow({ y: -100, height: 1200, windowHeight: 800 })).toBe(true)
	expect(isHalfInWindow({ y: 500, height: 1200, windowHeight: 800 })).toBe(false)
})
