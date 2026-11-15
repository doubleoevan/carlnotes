// the updates opener: the daily cache, a scoped opener, a rejected reservation, a failed call, and a slow call
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { UpdatesFinding } from "@carlnotes/contracts/updates"
import * as redis from "@carlnotes/db/redis"
import * as litellm from "@carlnotes/models/litellm"
import * as spendReservations from "@carlnotes/models/spendReservations"
import * as updatesOpenerWriter from "@carlnotes/pipeline/updatesOpener"
import * as monitoring from "@carlnotes/server/monitoring"
import { loadUpdatesOpener } from "./updatesOpener"

// the Findings an opener is written from
const UPDATES_FINDINGS = [{ topicName: "Espresso", title: "Dialing in" }] as UpdatesFinding[]

// the stored openers by key, which the stubbed cache reads and writes as the real one does
const storedOpeners = new Map<string, string | null>()

// the spies that each test reads
let writeSpy: ReturnType<typeof spyOn<typeof updatesOpenerWriter, "writeUpdatesOpener">>
let releaseSpy: ReturnType<typeof mock>

// stub the cache, the budget, the key, and the writer
beforeEach(() => {
	storedOpeners.clear()
	spyOn(redis, "cacheJson").mockImplementation(async ({ key, load, isStorable }) => {
		const storedOpener = storedOpeners.get(key)
		if (storedOpener !== undefined) {
			return storedOpener as never
		}
		// load the opener on a miss. isStorable decides whether to store the opener
		const loadedOpener = await load()
		if (!isStorable || isStorable(loadedOpener)) {
			storedOpeners.set(key, loadedOpener as string | null)
		}
		return loadedOpener
	})
	// stub the budget, the key, and the writer
	releaseSpy = mock(async () => {})
	spyOn(spendReservations, "reserveUserSpend").mockResolvedValue({ release: releaseSpy })
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("user-key")
	writeSpy = spyOn(updatesOpenerWriter, "writeUpdatesOpener").mockResolvedValue("Carl's line.")
})

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

test("a list stops waiting for a slow opener, and the opener still reaches the next list", async () => {
	// a timer that fires at once, and a model call that finishes after the wait
	const realSetTimeout = globalThis.setTimeout
	spyOn(globalThis, "setTimeout").mockImplementation(((onTimeout: () => void) =>
		realSetTimeout(onTimeout, 0)) as unknown as typeof setTimeout)
	let finishWrite: (opener: string) => void = () => {}
	writeSpy.mockImplementation(() => new Promise((resolve) => (finishWrite = resolve)))

	// the list returns with no opener
	const options = { userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS }
	expect(await loadUpdatesOpener(options)).toBeNull()

	// the late opener is stored, and the next list reads it with no second call
	finishWrite("Carl's slow line.")
	await new Promise((resolve) => realSetTimeout(resolve, 0))
	expect(await loadUpdatesOpener(options)).toBe("Carl's slow line.")
	expect(writeSpy).toHaveBeenCalledTimes(1)
})

test("the second list of the day shows the cached opener and runs no model call", async () => {
	const options = { userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS }
	expect(await loadUpdatesOpener(options)).toBe("Carl's line.")
	expect(await loadUpdatesOpener(options)).toBe("Carl's line.")
	expect(writeSpy).toHaveBeenCalledTimes(1)
})

test("the opener is keyed on the user and the UTC day", async () => {
	await loadUpdatesOpener({ userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	const [cacheKey] = [...storedOpeners.keys()]
	expect(cacheKey).toContain(new Date().toISOString().slice(0, 10))
	expect(cacheKey).toContain("user-1")
})

test("another user gets their own opener", async () => {
	await loadUpdatesOpener({ userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	await loadUpdatesOpener({ userId: "user-2", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	expect(writeSpy).toHaveBeenCalledTimes(2)
})

test("a scoped list after an unscoped list writes that Topic's own opener", async () => {
	await loadUpdatesOpener({ userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	await loadUpdatesOpener({ userId: "user-1", topicId: "topic-1", loadUpdatesFindings: async () => UPDATES_FINDINGS })
	expect(writeSpy).toHaveBeenCalledTimes(2)
})

test("the opener bills the user's own key, from the Topic names and titles, and releases its reservation", async () => {
	await loadUpdatesOpener({ userId: "user-1", topicId: null, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	expect(writeSpy).toHaveBeenCalledWith({
		topicNames: ["Espresso"],
		findingTitles: ["Dialing in"],
		litellmApiKey: "user-key",
	})
	expect(spendReservations.reserveUserSpend).toHaveBeenCalledWith({
		userId: "user-1",
		kind: "updatesOpener",
		maxDollars: updatesOpenerWriter.MAX_UPDATES_OPENER_DOLLARS,
	})
	expect(releaseSpy).toHaveBeenCalledTimes(1)
})

test("a rejected reservation returns no opener, runs no model call, and stores nothing", async () => {
	spyOn(spendReservations, "reserveUserSpend").mockResolvedValue("rejected")
	const opener = await loadUpdatesOpener({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(opener).toBeNull()
	expect(writeSpy).not.toHaveBeenCalled()
	expect(storedOpeners.size).toBe(0)
})

test("a failed reservation returns no opener, stores nothing, and reports the failure", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(spendReservations, "reserveUserSpend").mockRejectedValue(new Error("reservation failed"))
	const opener = await loadUpdatesOpener({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(opener).toBeNull()
	expect(storedOpeners.size).toBe(0)
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

test("a failed release returns no opener and reports the failure", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	releaseSpy.mockRejectedValue(new Error("release failed"))
	const opener = await loadUpdatesOpener({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(opener).toBeNull()
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

test("a failed call returns no opener, stores nothing, reports the failure, and releases the reservation", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	writeSpy.mockRejectedValue(new Error("model failed"))
	const opener = await loadUpdatesOpener({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(opener).toBeNull()
	expect(storedOpeners.size).toBe(0)
	// the failure is reported and the reservation is released
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(releaseSpy).toHaveBeenCalledTimes(1)
})

test("a budget the key's own limit rejects returns no opener and is not reported", async () => {
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const budgetRejection = Object.assign(new Error("rejected"), {
		statusCode: 429,
		responseBody: '{"error":{"type":"budget_exceeded"}}',
	})
	writeSpy.mockRejectedValue(budgetRejection)
	const opener = await loadUpdatesOpener({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(opener).toBeNull()
	expect(reportErrorSpy).not.toHaveBeenCalled()
})

test("a failed key read returns no opener", async () => {
	spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockRejectedValue(new Error("no key"))
	const opener = await loadUpdatesOpener({
		userId: "user-1",
		topicId: null,
		loadUpdatesFindings: async () => UPDATES_FINDINGS,
	})
	expect(opener).toBeNull()
	expect(releaseSpy).toHaveBeenCalledTimes(1)
})

test("a read with no Finding returns the day's stored opener and never writes one", async () => {
	// nothing is stored yet, so a read with no Finding returns no opener and stores nothing
	const emptyOptions = { userId: "user-1", topicId: null, loadUpdatesFindings: async () => [] }
	expect(await loadUpdatesOpener(emptyOptions)).toBeNull()
	expect(storedOpeners.size).toBe(0)

	// a list stores the day's opener, and the read with no Finding then shares it under the same key
	await loadUpdatesOpener({ ...emptyOptions, loadUpdatesFindings: async () => UPDATES_FINDINGS })
	expect(await loadUpdatesOpener(emptyOptions)).toBe("Carl's line.")
	expect(storedOpeners.size).toBe(1)
	expect(writeSpy).toHaveBeenCalledTimes(1)
})
