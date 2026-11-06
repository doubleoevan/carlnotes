// the scan tools: who may start and stop a Scan, what each gate says, and the bound Topic. a Scan a tool starts takes the
// topic page's path, so its Podcast Episode workflow starts the same way

import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { McpScanStatus } from "@carlnotes/contracts/mcpScanStatus"
import { IDLE_SCAN_STATUS, RUNNING_SCAN_STATUS } from "@carlnotes/contracts/mcpScanStatusTestFixtures"
import { MANUAL_SCAN_PAUSED_LABEL, SCAN_SPENT_BUDGET_LABEL } from "@carlnotes/contracts/scanFailure"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { topics } from "@carlnotes/db/schema/topics"
import * as litellm from "@carlnotes/models/litellm"
import * as scan from "@carlnotes/pipeline/scan"
import * as staleScans from "@carlnotes/pipeline/staleScans"
import type { CallToolResult } from "@modelcontextprotocol/server"
import * as authorization from "../authorization"
import * as topicScans from "../topic/scans"
import * as stopManualScanModule from "../topic/stopManualScan"
import * as mcpViewData from "./mcpViewData"
import * as results from "./results"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import * as scanResults from "./scanResults"
import { toRegisteredTools, toResultText, USER, VISITOR } from "./toolTestFixtures"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the Topic every tool reads, and a running Scan's status on it
const TOPIC = { id: "topic-1", name: "Espresso", ownerId: "user-1" } as typeof topics.$inferSelect
const RUNNING_STATUS: McpScanStatus = { ...RUNNING_SCAN_STATUS, keptCount: 2 }

// what the model's fenced copy of the running status keeps as it was
const RUNNING_STATUS_FIELDS = { state: "running", scanId: "scan-1", keptCount: 2, canStop: true }

// stub the Topic read, the status read, and the MCP view's data
function stubScanReads(): void {
	spyOn(results, "loadVisibleTopic").mockResolvedValue(TOPIC)
	spyOn(scanResults, "loadMcpScanStatus").mockResolvedValue(RUNNING_STATUS)
	spyOn(mcpViewData, "loadScanMcpViewData").mockResolvedValue({ session: null, podcastEpisodes: [] })
}

// stub the reads for a Topic with no Scan yet, so the first status read is idle and any later read is running
function stubIdleScanReads(): void {
	stubScanReads()
	spyOn(scanResults, "loadMcpScanStatus").mockResolvedValueOnce(IDLE_SCAN_STATUS)
}

// call one tool as the user on the unbound route
async function callTool(toolName: string, topicId = "topic-1"): Promise<CallToolResult> {
	const tool = toRegisteredTools(USER).get(toolName)
	if (!tool) {
		throw new Error(`no tool named ${toolName}`)
	}
	return tool.handler({ topic_id: topicId })
}

test("the owner starts a Scan with no overage, and the result shows it", async () => {
	stubIdleScanReads()
	const runManualScanSpy = spyOn(topicScans, "runManualScan").mockResolvedValue({
		status: "started",
		remainingScans: 4,
	})

	// the tool asks for no overage, and its result names the Scan with the MCP view's data beside it
	const toolResult = await callTool("start_scan")
	expect(runManualScanSpy).toHaveBeenCalledWith("user-1", "topic-1", expect.objectContaining({ entryPoint: "mcp" }), {
		isOverageAllowed: false,
	})
	expect(toolResult.structuredContent).toMatchObject(RUNNING_STATUS_FIELDS)
	expect(toResultText(toolResult)).toContain("Carl is brewing")
	expect(toolResult._meta).toBeDefined()
})

test.each([
	["quota", "daily brew limit"],
	["budget", SCAN_SPENT_BUDGET_LABEL],
	["paused", MANUAL_SCAN_PAUSED_LABEL],
	["unavailable", "temporarily unavailable"],
] as const)("a %s start says so and shows no Scan", async (status, expectedText) => {
	stubIdleScanReads()
	spyOn(topicScans, "runManualScan").mockResolvedValue({ status })

	// a gate's message is a plain text result, with no Scan in it
	const toolResult = await callTool("start_scan")
	expect(toResultText(toolResult)).toContain(expectedText)
	expect(toolResult.isError).toBe(false)
	expect(toolResult.structuredContent).toBeUndefined()
})

test("past the daily quota, the result links to Plans", async () => {
	stubIdleScanReads()
	spyOn(topicScans, "runManualScan").mockResolvedValue({ status: "quota" })
	expect(toResultText(await callTool("start_scan"))).toContain("/plans")
})

test("a team member who may edit is told who may brew", async () => {
	stubIdleScanReads()
	spyOn(topicScans, "runManualScan").mockResolvedValue({ status: "forbidden" })

	// the rejection says who may scan, and it is an error
	const toolResult = await callTool("start_scan")
	expect(toResultText(toolResult)).toBe("Only this topic's owner or an admin may brew it.")
	expect(toolResult.isError).toBe(true)
})

test("a running Scan is shown instead of a new one, even past the daily limit", async () => {
	stubScanReads()
	const runManualScanSpy = spyOn(topicScans, "runManualScan").mockResolvedValue({ status: "quota" })

	// the status shows before any gate runs
	expect((await callTool("start_scan")).structuredContent).toMatchObject(RUNNING_STATUS_FIELDS)
	expect(runManualScanSpy).not.toHaveBeenCalled()
})

test("a Scan that starts between the read and the start is shown", async () => {
	stubIdleScanReads()
	spyOn(topicScans, "runManualScan").mockResolvedValue({ status: "running" })
	expect((await callTool("start_scan")).structuredContent).toMatchObject(RUNNING_STATUS_FIELDS)
})

test("a team member who may not stop a running Scan still gets the rejection", async () => {
	stubScanReads()
	spyOn(scanResults, "loadMcpScanStatus").mockResolvedValue({ ...RUNNING_STATUS, canStop: false })
	spyOn(topicScans, "runManualScan").mockResolvedValue({ status: "forbidden" })

	// the rejection says who may scan, and it is an error
	const toolResult = await callTool("start_scan")
	expect(toResultText(toolResult)).toBe("Only this topic's owner or an admin may brew it.")
	expect(toolResult.isError).toBe(true)
})

test("a Topic the caller may not read matches a missing one on every scan tool", async () => {
	spyOn(results, "loadVisibleTopic").mockResolvedValue(null)
	const runManualScanSpy = spyOn(topicScans, "runManualScan")
	const stopManualScanSpy = spyOn(stopManualScanModule, "stopManualScan")

	// every tool reads the same as a missing Topic and starts or stops nothing
	for (const toolName of ["start_scan", "read_scan_status", "stop_scan"]) {
		expect(toResultText(await callTool(toolName))).toBe("No readable topic has that id.")
	}
	expect(runManualScanSpy).not.toHaveBeenCalled()
	expect(stopManualScanSpy).not.toHaveBeenCalled()
})

test("a visitor starts and stops nothing", async () => {
	const runManualScanSpy = spyOn(topicScans, "runManualScan")
	const stopManualScanSpy = spyOn(stopManualScanModule, "stopManualScan")

	// both tools return the connect text
	const registeredTools = toRegisteredTools(VISITOR)
	for (const toolName of ["start_scan", "stop_scan"]) {
		const toolResult = await registeredTools.get(toolName)?.handler({ topic_id: "topic-1" })
		expect(toolResult?.content).toEqual([{ type: "text", text: CONNECT_ACCOUNT_TEXT }])
	}
	expect(runManualScanSpy).not.toHaveBeenCalled()
	expect(stopManualScanSpy).not.toHaveBeenCalled()
})

test("a visitor reads a public Topic's status", async () => {
	stubScanReads()
	const toolResult = await toRegisteredTools(VISITOR).get("read_scan_status")?.handler({ topic_id: "topic-1" })
	expect(toolResult?.structuredContent).toMatchObject(RUNNING_STATUS_FIELDS)
})

test("a bound route rejects another Topic before any read", async () => {
	const loadVisibleTopicSpy = spyOn(results, "loadVisibleTopic")

	// every scan tool on /mcp/t/topic-1 rejects another Topic
	const registeredTools = toRegisteredTools(USER, "topic-1")
	for (const toolName of ["start_scan", "read_scan_status", "stop_scan"]) {
		const toolResult = await registeredTools.get(toolName)?.handler({ topic_id: "other-topic" })
		expect(toolResult?.isError).toBe(true)
	}
	expect(loadVisibleTopicSpy).not.toHaveBeenCalled()
})

test("the owner stops a Scan and the result says what it kept", async () => {
	stubScanReads()
	spyOn(stopManualScanModule, "stopManualScan").mockResolvedValue({ status: "stopped" })

	// the result reports the kept count the MCP view shows
	const toolResult = await callTool("stop_scan")
	expect(toolResult.structuredContent).toEqual({ status: "stopped", keptCount: 2 })
	expect(toResultText(toolResult)).toContain("Stopped the brew")
})

test("a stop with nothing running says so and is no error", async () => {
	stubScanReads()
	spyOn(stopManualScanModule, "stopManualScan").mockResolvedValue({ status: "idle" })

	const toolResult = await callTool("stop_scan")
	expect(toResultText(toolResult)).toBe("No brew is running on this topic.")
	expect(toolResult.isError).toBeUndefined()
})

test.each([
	["forbidden", "Only this topic's owner or an admin may stop its brew."],
	["unavailable", "The stop did not go through. Try again in a minute."],
] as const)("a %s stop returns its message as an error", async (status, expectedText) => {
	stubScanReads()
	spyOn(stopManualScanModule, "stopManualScan").mockResolvedValue({ status })

	const toolResult = await callTool("stop_scan")
	expect(toResultText(toolResult)).toBe(expectedText)
	expect(toolResult.isError).toBe(true)
})

test("a Scan the tool starts takes the page's start, with no scan option in the path", async () => {
	stubIdleScanReads()

	// the gates allow the Scan, so only the start itself remains
	stubConnectionPool(({ text }) => (text.includes('from "topics"') ? [toTableRow(topics, { id: "topic-1" })] : []))
	spyOn(authorization, "loadManualScanAuthorization").mockResolvedValue({
		status: "allowed",
		remainingScans: 2,
		isOverage: false,
	})
	spyOn(authorization, "loadMonthlyBudgetCutoffStatus").mockResolvedValue("allowed")
	spyOn(litellm, "isUserLiteLLMKeyBudgetExhausted").mockResolvedValue(false)
	spyOn(staleScans, "failStaleScans").mockResolvedValue(0)
	spyOn(scan, "loadScan").mockResolvedValue(undefined)
	const startTopicScanSpy = spyOn(scan, "startTopicScan").mockResolvedValue({
		status: "started",
		scan: { id: "scan-1" } as never,
		whenFinished: async () => {},
	})

	// the start is the page's call, with the same three arguments, so the workflow and its Podcast Episode follow
	await callTool("start_scan")
	expect(startTopicScanSpy.mock.calls).toEqual([["topic-1", "user-1", "manual"]])
})
