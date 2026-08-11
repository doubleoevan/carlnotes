// scan tests for opening a Scan row, handing it to Temporal, and reading it back.
// the database and the Temporal client are stood in so these run without either
import { expect, mock, test } from "bun:test"

// every db verb this file's calls go through, and the rows each one resolves to for the test in flight.
// reset before each test so one test's setup can't leak into the next
let dbCalls: string[] = []
let dbResults: { select: unknown[]; insert: unknown[]; update: unknown[] } = { select: [], insert: [], update: [] }

// a chainable stand-in for a Drizzle query. every method returns itself, so any chain length resolves,
// and awaiting it resolves to the verb's configured rows
// biome-ignore lint/suspicious/noExplicitAny: stands in for whatever shape a Drizzle chain link expects
function toQueryStub(verb: "select" | "insert" | "update" | "delete"): any {
	dbCalls.push(verb)
	const rows = verb === "delete" ? [] : dbResults[verb]
	// biome-ignore lint/suspicious/noExplicitAny: same stand-in shape as the function's return type
	const stub: any = new Proxy(() => {}, {
		get: (_target, prop) => (prop === "then" ? (resolve: (value: unknown) => void) => resolve(rows) : () => stub),
	})
	return stub
}
mock.module("../db", () => ({
	db: {
		select: () => toQueryStub("select"),
		insert: () => toQueryStub("insert"),
		update: () => toQueryStub("update"),
		delete: () => toQueryStub("delete"),
	},
}))

// the workflow start outcome the mocked temporal client hands back, or an error for it to throw
let workflowOutcome: { status: "started"; whenFinished: Promise<void> } | { status: "running" } | Error = {
	status: "started",
	whenFinished: Promise.resolve(),
}
mock.module("./temporal-client", () => ({
	startTopicScanWorkflow: async () => {
		if (workflowOutcome instanceof Error) {
			throw workflowOutcome
		}
		return workflowOutcome
	},
}))

import type { scans } from "../db/schema"
import { loadScan, scanTopic, startTopicScan } from "./scan"

type Scan = typeof scans.$inferSelect

// a full Scan row with every required column filled, so a test only names the fields it cares about
function fakeScan(overrides: Partial<Scan> = {}): Scan {
	return {
		id: "scan_1",
		topicId: "topic_1",
		ownerId: "owner_1",
		status: "running",
		error: null,
		startedAt: new Date(),
		finishedAt: null,
		dispatchedAt: null,
		isManual: false,
		cost: "0",
		foundCount: 0,
		keptCount: 0,
		filteredCount: 0,
		reused: 0,
		revalidated: 0,
		fetched: 0,
		stageCosts: {},
		scanSummary: null,
		fallbackSources: [],
		...overrides,
	}
}

test("scanTopic marks the scan dispatched when the workflow starts", async () => {
	dbCalls = []
	workflowOutcome = { status: "started", whenFinished: Promise.resolve() }
	const scan = fakeScan()
	const result = await scanTopic(scan, scan.topicId as string, scan.ownerId, "manual")
	expect(result).toEqual({ status: "started", scan, whenFinished: workflowOutcome.whenFinished })
	// the dispatch write happens, and nothing is deleted
	expect(dbCalls).toEqual(["update"])
})

test("scanTopic deletes a row it opened when the workflow reports one already running, but keeps a row that predates it", async () => {
	workflowOutcome = { status: "running" }
	const scan = fakeScan()

	// this call opened the row, so a rejection means it's cleaned up rather than left orphaned
	dbCalls = []
	expect(await scanTopic(scan, scan.topicId as string, scan.ownerId, "manual", false)).toEqual({ status: "running" })
	expect(dbCalls).toEqual(["delete"])

	// this call took over a row that already existed, so it's kept and just marked dispatched
	dbCalls = []
	expect(await scanTopic(scan, scan.topicId as string, scan.ownerId, "manual", true)).toEqual({ status: "running" })
	expect(dbCalls).toEqual(["update"])
})

test("scanTopic deletes a row it opened when the workflow start throws, but keeps a row that predates it", async () => {
	workflowOutcome = new Error("temporal unreachable")
	const scan = fakeScan()

	// a row this call opened is removed before the error propagates
	dbCalls = []
	await expect(scanTopic(scan, scan.topicId as string, scan.ownerId, "manual", false)).rejects.toThrow(
		"temporal unreachable",
	)
	expect(dbCalls).toEqual(["delete"])

	// a row that predates this call is left for the next sweep to pick up
	dbCalls = []
	await expect(scanTopic(scan, scan.topicId as string, scan.ownerId, "manual", true)).rejects.toThrow(
		"temporal unreachable",
	)
	expect(dbCalls).toEqual([])
})

test("startTopicScan opens a new scan row when the topic has none in flight", async () => {
	dbResults = { select: [], insert: [fakeScan({ id: "scan_new" })], update: [] }
	workflowOutcome = { status: "started", whenFinished: Promise.resolve() }
	dbCalls = []

	const result = await startTopicScan("topic_1", "owner_1", "manual")
	expect(result.status).toBe("started")
	// the row is created by insert, never taken over by update
	expect(dbCalls).toEqual(["select", "insert", "update"])
})

test("startTopicScan takes over an existing open scan row instead of opening a new one", async () => {
	dbResults = { select: [fakeScan({ id: "scan_open" })], insert: [], update: [fakeScan({ id: "scan_open" })] }
	workflowOutcome = { status: "started", whenFinished: Promise.resolve() }
	dbCalls = []

	const result = await startTopicScan("topic_1", "owner_1", "manual")
	expect(result.status).toBe("started")
	// the open row is taken over by update, never re-created by insert
	expect(dbCalls).toEqual(["select", "update", "update"])
})

test("startTopicScan throws when the scan row failed to write", async () => {
	dbResults = { select: [], insert: [], update: [] }
	await expect(startTopicScan("topic_1", "owner_1", "manual")).rejects.toThrow(
		"could not create scan for topic topic_1",
	)
})

test("loadScan reads a scan row by id, or undefined when there is none", async () => {
	dbResults = { select: [fakeScan({ id: "scan_1" })], insert: [], update: [] }
	expect((await loadScan("scan_1"))?.id).toBe("scan_1")

	dbResults = { select: [], insert: [], update: [] }
	expect(await loadScan("missing")).toBeUndefined()
})
