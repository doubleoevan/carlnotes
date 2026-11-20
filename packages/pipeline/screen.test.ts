// the pending Source screens: one failed start never stops the others, unless Temporal cannot be reached
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monitoring from "@carlnotes/server/monitoring"
import { screenPendingSources } from "./screen"
import * as temporalClient from "./temporalClient"

afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a failed screen start is reported and the next Source still starts, and a start that cannot reach Temporal is the last", async () => {
	// three pending Sources, a quiet console, and the reports
	stubConnectionPool(() => [["source-1"], ["source-2"], ["source-3"]])
	spyOn(console, "error").mockImplementation(() => {})
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// the first start fails on its own, and the other two start
	const startSpy = spyOn(temporalClient, "startSourceScreenWorkflow").mockResolvedValue(undefined)
	startSpy.mockRejectedValueOnce(new Error("bad source"))
	await screenPendingSources()
	expect(startSpy.mock.calls.map(([sourceId]) => sourceId)).toEqual(["source-1", "source-2", "source-3"])
	expect(reportErrorSpy.mock.calls.map((reportCall) => reportCall.slice(1))).toEqual([
		["source-screen", { sourceId: "source-1" }],
	])

	// a start that never connects is the only attempt, and the other two Sources stay pending
	startSpy.mockClear()
	startSpy.mockRejectedValue(
		new temporalClient.TemporalConnectError(new Error("Failed to connect before the deadline")),
	)
	await screenPendingSources()
	expect(startSpy.mock.calls.map(([sourceId]) => sourceId)).toEqual(["source-1"])
})
