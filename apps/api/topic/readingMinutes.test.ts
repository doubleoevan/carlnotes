// the reading time of a Resource: reads by size, watches and listens by duration, and each kind's estimate
import { expect, test } from "bun:test"
import { toReadingMinutes } from "./readingMinutes"

test("a read counts about 250 words a minute from its stored size", () => {
	const minutes = toReadingMinutes({ resourceKind: "read", contentBytes: 15_000, durationSeconds: null })
	expect(minutes).toBe(10)
})

test("a short read still counts one minute", () => {
	expect(toReadingMinutes({ resourceKind: "read", contentBytes: 60, durationSeconds: null })).toBe(1)
})

test.each(["watch", "listen"] as const)("a %s counts its stored duration", (resourceKind) => {
	const minutes = toReadingMinutes({ resourceKind, contentBytes: 900_000, durationSeconds: 1500 })
	expect(minutes).toBe(25)
})

test.each([
	["read", 5],
	["watch", 10],
	["listen", 30],
] as const)("a %s with no stored length counts its estimate", (resourceKind, minutes) => {
	expect(toReadingMinutes({ resourceKind, contentBytes: null, durationSeconds: null })).toBe(minutes)
})

test("a read with only a duration counts the read estimate", () => {
	expect(toReadingMinutes({ resourceKind: "read", contentBytes: null, durationSeconds: 600 })).toBe(5)
})

test("a stored length of zero counts as unknown", () => {
	expect(toReadingMinutes({ resourceKind: "listen", contentBytes: null, durationSeconds: 0 })).toBe(30)
})
