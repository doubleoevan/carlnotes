// the tools that start, read, and stop a Topic's Scan. each calls the path the topic page calls

import { type McpScanStatus, type McpScanStop, SCAN_STOP_FAILED_TEXT } from "@carlnotes/contracts/mcpScanStatus"
import { MANUAL_SCAN_PAUSED_LABEL, SCAN_SPENT_BUDGET_LABEL } from "@carlnotes/contracts/scanFailure"
import { SITE_URL } from "@carlnotes/contracts/site"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { z } from "zod"
import { type ManualScanResult, runManualScan } from "../topic/scans"
import { stopManualScan } from "../topic/stopManualScan"
import { loadScanMcpViewData, toMcpViewMeta } from "./mcpViewData"
import { loadVisibleTopic, toToolTopicId } from "./results"
import { loadMcpScanStatus, toFencedScanStatus, toScanStatusText } from "./scanResults"
import type { ToolCaller } from "./toolCaller"
import { type RegisterToolsOptions, toPageResult, topicIdArgument, toTextResult } from "./toolShapes"
import { toTopicWriteCall } from "./topicEditTools"
import { toMcpViewToolMeta } from "./uiResources"

// the argument every Scan tool takes
const scanToolInput = z.object({ topic_id: topicIdArgument })

// the text each rejected start reads as
const START_SCAN_REJECTIONS: Record<Exclude<ManualScanResult["status"], "started" | "running">, string> = {
	forbidden: "Only this topic's owner or an admin may brew it.",
	quota: `This account reached its daily brew limit. Plans have more: ${SITE_URL}/plans`,
	budget: SCAN_SPENT_BUDGET_LABEL,
	paused: MANUAL_SCAN_PAUSED_LABEL,
	unavailable: "Brewing is temporarily unavailable. Try again in a minute.",
}

/**
 * Registers the tools that start, read, and stop a Topic's Scan.
 */
export function registerScanTools({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"start_scan",
		{
			title: "Brew a topic",
			description:
				"Start a brew of a CarlNotes topic now. Carl reads its sources and keeps what's worth reading, and the brew sends its report and records its podcast episode like any other. It takes one of the account's daily brews, and only the topic's owner or an admin may start it. Past the daily limit no brew starts and nothing bills. Use it when the user asks Carl or CarlNotes to run a topic, with phrases like brew this topic now or run this topic now.",
			inputSchema: scanToolInput,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
			_meta: toMcpViewToolMeta("scan"),
		},
		async ({ topic_id }) => {
			const topicWriteCall = toTopicWriteCall({ toolCaller, routeTopicId, topicId: topic_id })
			if ("rejectionResult" in topicWriteCall) {
				return topicWriteCall.rejectionResult
			}

			// a Topic the caller may not read matches a missing one
			const topic = await loadVisibleTopic(toolCaller, topicWriteCall.topicId)
			if (!topic) {
				return toPageResult(null)
			}

			// a running Scan the caller may stop shows its status, whatever the gates would say about a new one
			const currentScanStatus = await loadMcpScanStatus(toolCaller, topic)
			if (currentScanStatus.state === "running" && currentScanStatus.canStop) {
				return toScanStatusResult(toolCaller, currentScanStatus)
			}

			// start the Scan the way the topic page does, with no overage
			const manualScanResult = await runManualScan(
				topicWriteCall.userId,
				topic.id,
				topicWriteCall.analyticsProperties,
				{
					isOverageAllowed: false,
				},
			)
			if (manualScanResult.status !== "started" && manualScanResult.status !== "running") {
				return toTextResult(START_SCAN_REJECTIONS[manualScanResult.status], manualScanResult.status === "forbidden")
			}

			// a started Scan and one already running both show the running status
			const mcpScanStatus = await loadMcpScanStatus(toolCaller, topic)
			return toScanStatusResult(toolCaller, mcpScanStatus)
		},
	)
	mcpServer.registerTool(
		"read_scan_status",
		{
			title: "Read a brew's status",
			description:
				"A CarlNotes topic's running brew, or its latest recap with none running: the stage Carl is on, what each source found, what he kept, and the state of the brew's podcast episode. Use it when the user asks Carl or CarlNotes about a brew, with phrases like how is the brew going, is Carl done, or show the latest brew.",
			inputSchema: scanToolInput,
			annotations: { readOnlyHint: true },
			_meta: toMcpViewToolMeta("scan"),
		},
		async ({ topic_id }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic) {
				return toTextResult(toolTopic.rejection, true)
			}

			// a Topic the caller may not read matches a missing one
			const topic = await loadVisibleTopic(toolCaller, toolTopic.topicId)
			if (!topic) {
				return toPageResult(null)
			}
			return toScanStatusResult(toolCaller, await loadMcpScanStatus(toolCaller, topic))
		},
	)
	mcpServer.registerTool(
		"stop_scan",
		{
			title: "Stop a brew",
			description:
				"Stop a CarlNotes topic's running brew. What Carl kept stays, what the brew spent stays charged, and its daily brew comes back. Only the topic's owner or an admin may stop it. Use it when the user asks Carl or CarlNotes to stop, with phrases like stop the brew or cancel this brew.",
			inputSchema: scanToolInput,
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async ({ topic_id }) => {
			const topicWriteCall = toTopicWriteCall({ toolCaller, routeTopicId, topicId: topic_id })
			if ("rejectionResult" in topicWriteCall) {
				return topicWriteCall.rejectionResult
			}

			// a Topic the caller may not read matches a missing one
			const topic = await loadVisibleTopic(toolCaller, topicWriteCall.topicId)
			if (!topic) {
				return toPageResult(null)
			}

			// read what the Scan kept so far, then stop it the way the topic page does
			const mcpScanStatus = await loadMcpScanStatus(toolCaller, topic)
			const stopScanResult = await stopManualScan(topicWriteCall.userId, topic.id, topicWriteCall.analyticsProperties)

			// a rejected or failed stop returns its message
			if (stopScanResult.status === "forbidden") {
				return toTextResult("Only this topic's owner or an admin may stop its brew.", true)
			}
			if (stopScanResult.status === "unavailable") {
				return toTextResult(SCAN_STOP_FAILED_TEXT, true)
			}

			// report what a stop kept, which is zero with nothing to stop
			const keptCount = mcpScanStatus.state === "running" ? mcpScanStatus.keptCount : 0
			return toScanStopResult({ status: stopScanResult.status, keptCount })
		},
	)
}

// a Scan status as a tool result. the model reads a fenced copy, and the plain status goes in the scan MCP view's data
async function toScanStatusResult(toolCaller: ToolCaller, mcpScanStatus: McpScanStatus): Promise<CallToolResult> {
	const fencedScanStatus = toFencedScanStatus(mcpScanStatus)
	return {
		content: [{ type: "text", text: toScanStatusText(fencedScanStatus) }],
		structuredContent: fencedScanStatus,
		_meta: toMcpViewMeta(await loadScanMcpViewData(toolCaller, mcpScanStatus)),
	}
}

// a stop as a tool result
function toScanStopResult(mcpScanStop: McpScanStop): CallToolResult {
	const text =
		mcpScanStop.status === "stopped"
			? `Stopped the brew. It kept ${mcpScanStop.keptCount}, and its daily brew is back.`
			: "No brew is running on this topic."
	return { content: [{ type: "text", text }], structuredContent: mcpScanStop }
}
