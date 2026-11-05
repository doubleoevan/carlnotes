import { expect, test } from "bun:test"
import type { PersonalSourcesWork } from "@carlnotes/contracts/personalSourcesWork"
import { runPersonalSourcesContextLoop } from "./personalSourcesContextLoop"

// advance a virtual clock through signals and restarts while retaining the database's dirty revision
const pending: PersonalSourcesWork = {
	revision: 1,
	processedRevision: 0,
	dirtySince: 0,
	changedAt: 0,
	now: 0,
}

test("bursts debounce but the first pending revision is rebuilt at the five-minute ceiling", async () => {
	let work = { ...pending }
	let version = 0
	const rebuildTimes: number[] = []
	await runPersonalSourcesContextLoop({
		readWork: async () => work,
		readSignalVersion: () => version,
		waitForChange: async (_version, delay) => {
			work = {
				...work,
				now: work.now + Math.min(delay, 20_000),
				changedAt: work.now + Math.min(delay, 20_000),
				revision: work.revision + 1,
			}
			version += 1
		},
		rebuild: async () => {
			rebuildTimes.push(work.now)
			work = { ...work, processedRevision: work.revision, dirtySince: null }
			return "ready"
		},
	})
	expect(rebuildTimes).toEqual([300_000])
})

test("a signal during the read refreshes metadata before sleeping", async () => {
	let version = 0
	let work: PersonalSourcesWork | null = { ...pending }
	let hasSignaled = false
	const waits: number[] = []
	const rebuilds: number[] = []
	await runPersonalSourcesContextLoop({
		readWork: async () => {
			if (!hasSignaled) {
				hasSignaled = true
				version += 1
			}
			return work
		},
		readSignalVersion: () => version,
		waitForChange: async (observed, delay) => {
			if (version !== observed || !work) {
				return
			}
			waits.push(delay)
			work.now += delay
		},
		rebuild: async () => {
			rebuilds.push(work?.now ?? -1)
			work = null
			return "empty"
		},
	})
	expect(waits).toEqual([30_000])
	expect(rebuilds).toEqual([30_000])
})

test("restart without a signal rebuilds overdue durable work and empty state makes no model attempt", async () => {
	let work: PersonalSourcesWork | null = { ...pending, now: 600_000 }
	let rebuilds = 0
	const adapters = {
		readWork: async () => work,
		readSignalVersion: () => 0,
		waitForChange: async () => {
			throw new Error("Overdue work must not sleep")
		},
		rebuild: async () => {
			rebuilds += 1
			work = null
			return "empty"
		},
	}
	expect(await runPersonalSourcesContextLoop(adapters)).toBe("done")
	expect(rebuilds).toBe(1)
	expect(await runPersonalSourcesContextLoop(adapters)).toBe("done")
	expect(rebuilds).toBe(1)
})

test("a failed sender does not postpone another sender's ready revision", async () => {
	let attempt = 0
	const waits: number[] = []
	await runPersonalSourcesContextLoop({
		readWork: async () => (attempt < 2 ? { ...pending, now: 600_000 } : null),
		readSignalVersion: () => 0,
		waitForChange: async (_version, delay) => {
			waits.push(delay)
		},
		rebuild: async () => {
			attempt += 1
			return attempt === 1 ? "retry" : "settled"
		},
	})
	expect(attempt).toBe(2)
	expect(waits).toEqual([])
})

test("an idle rebuild waits instead of spinning when authority changes during work", async () => {
	let hasWaited = false
	await runPersonalSourcesContextLoop({
		readWork: async () => (hasWaited ? null : { ...pending, now: 600_000 }),
		readSignalVersion: () => 0,
		waitForChange: async (_version, delay) => {
			expect(delay).toBe(900_000)
			hasWaited = true
		},
		rebuild: async () => "idle",
	})
	expect(hasWaited).toBe(true)
})
