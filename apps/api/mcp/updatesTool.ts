// the tool that returns an updates list, with the text a host without an MCP view reads

import { SITE_URL } from "@carlnotes/contracts/site"
import {
	DEFAULT_UPDATES_MINUTES,
	EMPTY_UPDATES_TEXT,
	UPDATES_MINUTES,
	type Updates,
} from "@carlnotes/contracts/updates"
import { toUntrustedFence } from "@carlnotes/models/prompts/write"
import { z } from "zod"
import { type BuiltUpdates, buildUpdates } from "../topic/updates"
import { loadUpdatesMcpViewData, toMcpViewMeta } from "./mcpViewData"
import { CONNECT_ACCOUNT_TEXT, toToolTopicId } from "./results"
import { toMcpAnalyticsProperties } from "./toolCaller"
import { type RegisterToolsOptions, toPageResult, topicIdArgument, toTextResult } from "./toolShapes"
import { toMcpViewToolMeta } from "./uiResources"

// the arguments the tool takes: a reading length, and the one topic of a scoped list
const updatesToolInput = z.object({
	minutes: z
		.literal(UPDATES_MINUTES)
		.optional()
		.describe("How many minutes of updates to read: 5, 15, or 30. Leave it out for 15."),
	topic_id: topicIdArgument.describe("One topic to read updates on. Leave it out for every topic the user follows."),
})

/**
 * Registers the tool that returns a user's unread findings as an updates list.
 */
export function registerUpdatesTool({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"read_updates",
		{
			title: "Read updates",
			description:
				"Read the user's CarlNotes updates: the unread findings Carl would read next across the topics they follow, or on one topic, trimmed to 5, 15, or 30 minutes of reading. Every finding it returns counts as read, so the next call moves on. Use it for requests like what's new, catch me up, update me, or what's new on a topic. Call it once for each time the user asks.",
			inputSchema: updatesToolInput,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
			_meta: toMcpViewToolMeta("updates"),
		},
		async ({ minutes, topic_id }) => {
			// a bound server covers its topic, and an argument naming another is rejected before anything reads it
			const toolTopic = routeTopicId || topic_id ? toToolTopicId(routeTopicId, topic_id ?? null) : { topicId: null }
			if ("rejection" in toolTopic) {
				return toTextResult(toolTopic.rejection, true)
			}
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}

			// build the list, which marks its findings read
			const updates = await buildUpdates({
				userId: toolCaller.userId,
				minutes: minutes ?? DEFAULT_UPDATES_MINUTES,
				topicId: toolTopic.topicId,
				analyticsProperties: toMcpAnalyticsProperties(toolCaller),
			})
			if (!updates) {
				return toPageResult(null)
			}

			// the model reads a fenced copy, and the MCP view reads the plain list from its data
			const fencedUpdates = toFencedUpdates(updates)
			return {
				content: [{ type: "text", text: toUpdatesText(fencedUpdates) }],
				structuredContent: fencedUpdates,
				_meta: toMcpViewMeta(await loadUpdatesMcpViewData(toolCaller, updates)),
			}
		},
	)
}

/**
 * Returns the list the model reads, with everything a page or a model wrote fenced as data. The rows' Topics and podcast
 * episodes go to the MCP view alone.
 */
export function toFencedUpdates({ opener, findings, moreCount, morePath }: BuiltUpdates): Updates {
	const toFencedText = toUntrustedFence()
	return {
		opener: opener && toFencedText(opener),
		findings: findings.map((finding) => ({
			...finding,
			title: finding.title && toFencedText(finding.title),
			url: toFencedText(finding.url),
			source: finding.source && toFencedText(finding.source),
			topicName: toFencedText(finding.topicName),
			relevanceExplanation: toFencedText(finding.relevanceExplanation),
		})),
		moreCount,
		morePath,
	}
}

/**
 * Returns the whole list as text: the opener, each finding's title, topic, link, and explanation, and the more link.
 */
export function toUpdatesText(updates: Updates): string {
	if (updates.findings.length === 0) {
		return EMPTY_UPDATES_TEXT
	}

	// one block for each finding, in ranked order
	const findingBlocks = updates.findings.map((finding, index) =>
		[
			`${index + 1}. ${finding.title ?? finding.url}`,
			`Topic: ${finding.topicName}`,
			`Link: ${finding.url}`,
			finding.relevanceExplanation,
		].join("\n"),
	)

	// the opener and the more link appear only if the list has them
	const moreLine = updates.moreCount > 0 ? `And ${updates.moreCount} more: ${SITE_URL}${updates.morePath}` : null
	return [updates.opener, ...findingBlocks, moreLine].filter(Boolean).join("\n\n")
}
