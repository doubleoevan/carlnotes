// stopping a Scan by hand: who may stop one, a Topic with nothing running, and a cancel call that fails
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { topics } from "@carlnotes/db/schema/topics"
import * as scan from "@carlnotes/pipeline/scan"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import * as authorization from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { toSignedInApp } from "../testSession"
import { scansRoute } from "./scans"
import { stopManualScan } from "./stopManualScan"

// the analytics properties every stop sends, which these tests do not read
const ANALYTICS_PROPERTIES = {} as AnalyticsProperties

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// stub the topic read, and whether the caller may stop a Scan on it
function stubTopicAuthority(isCallerAllowed: boolean): void {
	const topicRow = toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })
	stubConnectionPool(({ text }) => (text.includes('from "topics"') ? [topicRow] : []))
	spyOn(authorization, "isAllowed").mockResolvedValue(isCallerAllowed)
}

test("the owner stops a running Scan", async () => {
	stubTopicAuthority(true)
	const stopTopicScanSpy = spyOn(scan, "stopTopicScan").mockResolvedValue({
		status: "cancelled",
		whenStopped: async () => {},
	})
	expect(await stopManualScan("owner-1", "topic-1", ANALYTICS_PROPERTIES)).toEqual({ status: "stopped" })
	expect(stopTopicScanSpy).toHaveBeenCalledWith("topic-1")
})

test("a caller who is neither the owner nor an admin stops nothing", async () => {
	stubTopicAuthority(false)
	const stopTopicScanSpy = spyOn(scan, "stopTopicScan")
	expect(await stopManualScan("reader-1", "topic-1", ANALYTICS_PROPERTIES)).toEqual({ status: "forbidden" })
	expect(stopTopicScanSpy).not.toHaveBeenCalled()
})

test("a Topic with nothing running is idle", async () => {
	stubTopicAuthority(true)
	spyOn(scan, "stopTopicScan").mockResolvedValue({ status: "idle" })
	expect(await stopManualScan("owner-1", "topic-1", ANALYTICS_PROPERTIES)).toEqual({ status: "idle" })
})

test("a failed cancel is reported and returns unavailable", async () => {
	stubTopicAuthority(true)
	const reportErrorSpy = quietErrorReports()
	spyOn(scan, "stopTopicScan").mockRejectedValue(new Error("temporal is not reachable"))

	// the error is reported with the topic and the user, and the call returns instead of throwing
	expect(await stopManualScan("owner-1", "topic-1", ANALYTICS_PROPERTIES)).toEqual({ status: "unavailable" })
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "manual-scan", {
		topicId: "topic-1",
		userId: "owner-1",
	})
})

test("the stop route responds 503 for a failed cancel", async () => {
	stubTopicAuthority(true)
	quietErrorReports()
	spyOn(scan, "stopTopicScan").mockRejectedValue(new Error("temporal is not reachable"))

	const response = await toSignedInApp(scansRoute, "owner-1").request("/topics/topic-1/scan/stop", { method: "POST" })
	expect(response.status).toBe(503)
	expect(await response.json()).toEqual({ error: "scanning is temporarily unavailable, try again in a minute" })
})
