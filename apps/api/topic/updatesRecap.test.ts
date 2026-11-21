// the updates recap: the daily cache, a scoped recap, a rejected reservation, a failed call, a slow call, and the
// minute's marker of a read with no recap
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { UpdatesFinding } from "@carlnotes/contracts/updates"
import * as redis from "@carlnotes/db/redis"
import * as litellm from "@carlnotes/models/litellm"
import * as spendReservations from "@carlnotes/models/spendReservations"
import * as updatesRecapWriter from "@carlnotes/pipeline/updatesRecap"
import * as monitoring from "@carlnotes/server/monitoring"
import { loadUpdatesRecap } from "./updatesRecap"

// the Findings a recap is written from
const UPDATES_FINDINGS = [{ topicName: "Espresso", title: "Dialing in" }] as UpdatesFinding[]

// the stored recaps by key, which the stubbed cache reads and writes as the real one does, and each marker's lifetime
const storedRecaps = new Map<string, string | null>()
const markerTtlMsByKey = new Map<string, number>()

// the spies that each test reads
let writeSpy: ReturnType<typeof spyOn<typeof updatesRecapWriter, "writeUpdatesRecap">>
let releaseSpy: ReturnType<typeof mock>

// stub the cache, the budget, the key, and the writer
beforeEach(() => {
	storedRecaps.clear()
	markerTtlMsByKey.clear()
	spyOn(redis, "cacheJson").mockImplementation(async ({ key, load, isStorable }) => {
		const storedRecap = storedRecaps.get(key)
		if (storedRecap !== undefined) {
			return storedRecap as never
		}
		// load the recap on a miss. isStorable decides whether to store the recap
		const loadedRecap = await load()
		if (!isStorable || isStorable(loadedRecap)) {
			storedRecaps.set(key, loadedRecap as string | null)
		}
		return loadedRecap
	})
	// the marker is written only under a key that holds nothing
	spyOn(redis, "saveRedisJsonIfAbsent").mockImplementation(async ({ key, value, ttlMs }) => {
		if (!storedRecaps.has(key)) {
			storedRecaps.set(key, value as string | null)
			markerTtlMsByKey.set(key, ttlMs)
		}
	})
	// stub the budget, the key, and the writer
	releaseSpy = mock(async () => {})
	spyOn(spendReservations, "reserveUserSpend").mockResolvedValue({ release: releaseSpy })
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("user-key")
	writeSpy = spyOn(updatesRecapWriter, "writeUpdatesRecap").mockResolvedValue("Carl's line.")
})

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

test("a list stops waiting for a slow recap, and the recap still reaches the next list", async () => {
	// a timer that fires at once, and a model call that finishes after the wait
	const realSetTimeout = globalThis.setTimeout
	spyOn(globalThis, "setTimeout").mockImplementation(((onTimeout: () => void) =>
		realSetTimeout(onTimeout, 0)) as unknown as typeof setTimeout)
	let finishWrite: (recap: string) => void = () => {}
	writeSpy.mockImplementation(() => new Promise((resolve) => (finishWrite = resolve)))

	// the list returns with no recap
	const options = { userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS }
	expect(await loadUpdatesRecap(options)).toBeNull()

	// the late recap is stored, and the next list reads it with no second call
	finishWrite("Carl's slow line.")
	await new Promise((resolve) => realSetTimeout(resolve, 0))
	expect(await loadUpdatesRecap(options)).toBe("Carl's slow line.")
	expect(writeSpy).toHaveBeenCalledTimes(1)
})

test("the second list of the day shows the cached recap and runs no model call", async () => {
	const options = { userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS }
	expect(await loadUpdatesRecap(options)).toBe("Carl's line.")
	expect(await loadUpdatesRecap(options)).toBe("Carl's line.")
	expect(writeSpy).toHaveBeenCalledTimes(1)
})

test("the recap is keyed on the user and the UTC day", async () => {
	await loadUpdatesRecap({ userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	const [cacheKey] = [...storedRecaps.keys()]
	expect(cacheKey).toContain(new Date().toISOString().slice(0, 10))
	expect(cacheKey).toContain("user-1")
})

test("another user gets their own recap", async () => {
	await loadUpdatesRecap({ userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	await loadUpdatesRecap({ userId: "user-2", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	expect(writeSpy).toHaveBeenCalledTimes(2)
})

test("a scoped list after an unscoped list writes that Topic's own recap", async () => {
	await loadUpdatesRecap({ userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	await loadUpdatesRecap({ userId: "user-1", topicId: "topic-1", loadUpdatesFindings: async () => UPDATES_FINDINGS })
	expect(writeSpy).toHaveBeenCalledTimes(2)
})

test("the recap bills the user's own key, from the Topic names and titles, and releases its reservation", async () => {
	await loadUpdatesRecap({ userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	expect(writeSpy).toHaveBeenCalledWith({
		topicNames: ["Espresso"],
		findingTitles: ["Dialing in"],
		litellmApiKey: "user-key",
	})
	expect(spendReservations.reserveUserSpend).toHaveBeenCalledWith({
		userId: "user-1",
		kind: "updatesRecap",
		maxDollars: updatesRecapWriter.MAX_UPDATES_RECAP_DOLLARS,
	})
	expect(releaseSpy).toHaveBeenCalledTimes(1)
})

test("a rejected reservation returns no recap, runs no model call, and stores the marker for a minute", async () => {
	spyOn(spendReservations, "reserveUserSpend").mockResolvedValue("rejected")
	const recap = await loadUpdatesRecap({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(recap).toBeNull()
	expect(writeSpy).not.toHaveBeenCalled()
	expect([...storedRecaps.values()]).toEqual([null])
	expect([...markerTtlMsByKey.values()]).toEqual([60_000])
})

test("a failed reservation returns no recap, stores the marker, and reports the failure", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(spendReservations, "reserveUserSpend").mockRejectedValue(new Error("reservation failed"))
	const recap = await loadUpdatesRecap({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(recap).toBeNull()
	expect([...storedRecaps.values()]).toEqual([null])
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

test("a failed release returns no recap and reports the failure", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	releaseSpy.mockRejectedValue(new Error("release failed"))
	const recap = await loadUpdatesRecap({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(recap).toBeNull()
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

test("a failed call returns no recap, stores the marker, reports the failure, and releases the reservation", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	writeSpy.mockRejectedValue(new Error("model failed"))
	const recap = await loadUpdatesRecap({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(recap).toBeNull()
	expect([...storedRecaps.values()]).toEqual([null])
	// the failure is reported and the reservation is released
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(releaseSpy).toHaveBeenCalledTimes(1)
})

test("a budget the key's own limit rejects returns no recap and is not reported", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const budgetRejection = Object.assign(new Error("rejected"), {
		statusCode: 429,
		responseBody: '{"error":{"type":"budget_exceeded"}}',
	})
	writeSpy.mockRejectedValue(budgetRejection)
	const recap = await loadUpdatesRecap({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(recap).toBeNull()
	expect(reportErrorSpy).not.toHaveBeenCalled()
})

test("a failed key read returns no recap", async () => {
	spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockRejectedValue(new Error("no key"))
	const recap = await loadUpdatesRecap({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(recap).toBeNull()
	expect(releaseSpy).toHaveBeenCalledTimes(1)
})

test("a read with no Finding returns the day's stored recap and never writes one", async () => {
	// nothing is stored yet, so a read with no Finding returns no recap and stores the marker
	const emptyOptions = { userId: "user-1", topicId: null, loadUpdatesFindings: async () => [] }
	expect(await loadUpdatesRecap(emptyOptions)).toBeNull()
	expect([...storedRecaps.values()]).toEqual([null])

	// after the marker's minute a list stores the day's recap, and the read with no Finding then shares it
	storedRecaps.clear()
	await loadUpdatesRecap({ ...emptyOptions, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	expect(await loadUpdatesRecap(emptyOptions)).toBe("Carl's line.")
	expect(storedRecaps.size).toBe(1)
	expect(writeSpy).toHaveBeenCalledTimes(1)
})

test("a second load inside the marker's minute reads no Finding, reserves nothing, and calls no model", async () => {
	spyOn(monitoring, "reportError").mockImplementation(() => {})
	const reserveSpy = spyOn(spendReservations, "reserveUserSpend")

	// nothing unread, a spent budget, and a failed model, each for its own user
	const noRecapCases = [
		{ userId: "user-empty", updatesFindings: [] },
		{ userId: "user-spent", updatesFindings: UPDATES_FINDINGS, reservation: "rejected" as const },
		{ userId: "user-failed", updatesFindings: UPDATES_FINDINGS, writeError: new Error("model failed") },
	]
	for (const { userId, updatesFindings, reservation, writeError } of noRecapCases) {
		// the first load reads, and the second reads the marker alone
		if (reservation) {
			reserveSpy.mockResolvedValueOnce(reservation)
		}
		if (writeError) {
			writeSpy.mockRejectedValueOnce(writeError)
		}

		// two loads, each with no recap
		const loadUpdatesFindings = mock(async () => updatesFindings)
		expect(await loadUpdatesRecap({ userId, topicId: null, loadUpdatesFindings })).toBeNull()
		const [reserveCount, writeCount] = [reserveSpy.mock.calls.length, writeSpy.mock.calls.length]
		expect(await loadUpdatesRecap({ userId, topicId: null, loadUpdatesFindings })).toBeNull()

		// one read of the unread Findings, and no second reservation or model call
		expect(loadUpdatesFindings).toHaveBeenCalledTimes(1)
		expect([reserveSpy.mock.calls.length, writeSpy.mock.calls.length]).toEqual([reserveCount, writeCount])
	}
})

test("a recap that a slower call stores replaces the marker", async () => {
	// a slow call that is still writing, and a second call that fails and stores the marker
	spyOn(monitoring, "reportError").mockImplementation(() => {})
	let finishWrite: (recap: string) => void = () => {}
	writeSpy.mockImplementationOnce(() => new Promise((resolve) => (finishWrite = resolve)))
	writeSpy.mockRejectedValueOnce(new Error("model failed"))
	const options = { userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS }
	const slowRecap = loadUpdatesRecap(options)
	expect(await loadUpdatesRecap(options)).toBeNull()

	// the slow call's recap replaces the marker, and the next list reads it
	finishWrite("Carl's slow line.")
	expect(await slowRecap).toBe("Carl's slow line.")
	expect(await loadUpdatesRecap(options)).toBe("Carl's slow line.")
})
