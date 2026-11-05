// virtual timestamps exercise quiet periods, burst ceilings, recovery, and settled context without timers
import { expect, test } from "bun:test"
import { type PersonalSourcesWork, personalSourcesWorkDelay } from "./personalSourcesWork"

// a first pending revision arrived at virtual time zero
const pending: PersonalSourcesWork = {
	revision: 1,
	processedRevision: 0,
	dirtySince: 0,
	changedAt: 0,
	now: 0,
}

test("one delivery waits thirty seconds of quiet", () => {
	expect(personalSourcesWorkDelay(pending)).toBe(30_000)
	expect(personalSourcesWorkDelay({ ...pending, now: 29_999 })).toBe(1)
	expect(personalSourcesWorkDelay({ ...pending, now: 30_000 })).toBe(0)
})

test("new revisions extend quiet time but never exceed the five-minute ceiling", () => {
	for (let now = 20_000; now < 300_000; now += 20_000) {
		expect(personalSourcesWorkDelay({ ...pending, revision: now / 20_000, now, changedAt: now })).toBe(
			Math.min(30_000, 300_000 - now),
		)
	}
	expect(personalSourcesWorkDelay({ ...pending, now: 300_000, changedAt: 299_999 })).toBe(0)
})

test("restart and missed signals preserve the persisted deadline", () => {
	expect(personalSourcesWorkDelay({ ...pending, now: 120_000 })).toBe(0)
	expect(personalSourcesWorkDelay({ ...pending, now: 500_000, changedAt: 490_000 })).toBe(0)
})

test("settled context needs no scheduled work, even years later", () => {
	const settled = { ...pending, processedRevision: 1, dirtySince: null }
	expect(personalSourcesWorkDelay(settled)).toBeNull()
	expect(personalSourcesWorkDelay({ ...settled, now: 365 * 86_400_000 })).toBeNull()
})

test("a failed sender retries at its own deadline", () => {
	expect(personalSourcesWorkDelay({ ...pending, now: 600_000, retryAt: 900_000 })).toBe(300_000)
	expect(personalSourcesWorkDelay({ ...pending, now: 900_000, retryAt: 900_000 })).toBe(0)
})
