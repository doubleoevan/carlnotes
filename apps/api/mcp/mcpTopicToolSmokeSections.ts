// live gates for read_updates, read_topic_context, and the Scan tools on both routes

import type { McpScanStatus, McpScanStop } from "@carlnotes/contracts/mcpScanStatus"
import type { Updates } from "@carlnotes/contracts/updates"
import { stopFirstScan } from "../topic/firstScanSmoke"
import { largeTopicId } from "./mcpDirectorySmokeFixtures"
import { checkPageBounds, type SmokeClient } from "./mcpResultSmokeSections"
import { check, toClient, topicId, toResultJson } from "./mcpSmokeFixtures"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { toResultText } from "./toolTestFixtures"
import type { McpTopicContext } from "./topicContextResults"

// the question every read_topic_context call asks
const TOPIC_CONTEXT_QUESTION = "What should I read first?"

// the tools a visitor is sent to connect an account by, each with arguments it would accept
const ACCOUNT_TOOL_CALLS = [
	{ name: "send_finding_feedback", arguments: { finding_id: "finding-1", feedback: "Too basic for me" } },
	{ name: "read_updates", arguments: { topic_id: topicId } },
	{ name: "read_topic_context", arguments: { topic_id: topicId, question: TOPIC_CONTEXT_QUESTION } },
	{ name: "start_scan", arguments: { topic_id: topicId } },
	{ name: "stop_scan", arguments: { topic_id: topicId } },
]

/**
 * Checks what a visitor reads from read_updates, read_topic_context, and the Scan tools on both routes.
 */
export async function checkVisitorTopicTools(): Promise<void> {
	for (const path of ["/mcp", `/mcp/t/${topicId}`]) {
		const { client, transport } = toClient(path)
		try {
			await client.connect(transport)

			// each account-only tool returns the connect-account text, with nothing started
			for (const toolCall of ACCOUNT_TOOL_CALLS) {
				const toolResultText = toResultText(await client.callTool(toolCall))
				check(`${path}: ${toolCall.name} asks a visitor to connect`, toolResultText === CONNECT_ACCOUNT_TEXT)
			}

			// a visitor reads a public Topic's recap
			const scanStatus = toResultJson<McpScanStatus>(
				await client.callTool({ name: "read_scan_status", arguments: { topic_id: topicId } }),
			)
			check(`${path}: a visitor reads a public Topic's recap`, scanStatus.state === "finished", scanStatus)
		} finally {
			// release the SDK transport after each endpoint
			await client.close()
		}
	}
}

/**
 * Checks that read_updates and read_topic_context fit their page on the largest Topic, on both routes, and say what
 * they left out.
 */
export async function checkTopicToolResults(accessToken: string): Promise<void> {
	for (const path of ["/mcp", `/mcp/t/${largeTopicId}`]) {
		const { client, transport } = toClient(path, accessToken)
		try {
			await client.connect(transport)
			await checkUpdatesResult(client, path)
			await checkTopicContextResult(client, path)
			const scanStatusResult = await client.callTool({
				name: "read_scan_status",
				arguments: { topic_id: largeTopicId },
			})
			checkPageBounds(`${path} read_scan_status`, scanStatusResult)
		} finally {
			// release the SDK transport after each endpoint
			await client.close()
		}
	}
}

/** Starts, reads, and stops a Scan on both routes. */
export async function checkScanTools(accessToken: string): Promise<void> {
	for (const path of ["/mcp", `/mcp/t/${topicId}`]) {
		const { client, transport } = toClient(path, accessToken)
		try {
			await client.connect(transport)
			await checkScanLifecycle(client, path)
		} finally {
			// release the SDK transport after each endpoint
			await client.close()
		}
	}
}

// the longest list of the large Topic fills its page and counts what it left out
async function checkUpdatesResult(client: SmokeClient, path: string): Promise<void> {
	const readUpdatesResult = await client.callTool({
		name: "read_updates",
		arguments: { topic_id: largeTopicId, minutes: 30 },
	})
	checkPageBounds(`${path} read_updates`, readUpdatesResult)
	const updates = toResultJson<Updates>(readUpdatesResult)
	check(
		`${path}: read_updates says how many findings it left out`,
		updates.findings.length > 0 &&
			updates.moreCount > 0 &&
			toResultText(readUpdatesResult).includes(`And ${updates.moreCount} more:`),
		{ findingCount: updates.findings.length, moreCount: updates.moreCount },
	)
}

// the embedded Findings overflow the page, so whole Findings leave and the text counts them
async function checkTopicContextResult(client: SmokeClient, path: string): Promise<void> {
	const readTopicContextResult = await client.callTool({
		name: "read_topic_context",
		arguments: { topic_id: largeTopicId, question: TOPIC_CONTEXT_QUESTION },
	})
	checkPageBounds(`${path} read_topic_context`, readTopicContextResult)
	const topicContext = toResultJson<McpTopicContext>(readTopicContextResult)
	const { findings, leftOutFindingCount } = topicContext
	check(
		`${path}: read_topic_context says how many findings it left out`,
		findings.length > 0 &&
			leftOutFindingCount > 0 &&
			toResultText(readTopicContextResult).includes(`${leftOutFindingCount} more findings were left out to fit.`),
		{ findingCount: findings.length, leftOutFindingCount },
	)
}

// a Scan starts, reads as running, stops, and leaves the Topic's recap and its daily Scan for the next route
async function checkScanLifecycle(client: SmokeClient, path: string): Promise<void> {
	const scanTool = { arguments: { topic_id: topicId } }

	// start the Scan and read it back
	const startResult = await client.callTool({ name: "start_scan", ...scanTool })
	const startedStatus = toResultJson<McpScanStatus>(startResult)
	check(
		`${path}: start_scan starts a Scan the owner can stop`,
		isStoppableScan(startedStatus),
		toResultText(startResult),
	)
	const runningStatus = toResultJson<McpScanStatus>(await client.callTool({ name: "read_scan_status", ...scanTool }))
	check(
		`${path}: read_scan_status reads the running Scan`,
		startedStatus.state === "running" &&
			runningStatus.state === "running" &&
			runningStatus.scanId === startedStatus.scanId,
		runningStatus,
	)

	// stop it and wait for its workflow to end
	const stopResult = await client.callTool({ name: "stop_scan", ...scanTool })
	check(
		`${path}: stop_scan stops the Scan`,
		toResultJson<McpScanStop>(stopResult).status === "stopped",
		toResultText(stopResult),
	)
	await stopFirstScan(topicId)

	// nothing is left to stop, and the status returns to the seeded recap
	const repeatStopResult = await client.callTool({ name: "stop_scan", ...scanTool })
	check(
		`${path}: a second stop_scan finds nothing to stop`,
		toResultJson<McpScanStop>(repeatStopResult).status === "idle",
		toResultText(repeatStopResult),
	)
	const stoppedStatus = toResultJson<McpScanStatus>(await client.callTool({ name: "read_scan_status", ...scanTool }))
	check(`${path}: a stopped Scan leaves the recap`, stoppedStatus.state === "finished", stoppedStatus)
}

// whether a status is a running Scan its caller may stop
function isStoppableScan(mcpScanStatus: McpScanStatus): boolean {
	return mcpScanStatus.state === "running" && mcpScanStatus.canStop
}
