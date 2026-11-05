// MCP Topic Draft defaults use the account's editable tags and existing podcast spend cutoff
import type { McpViewData } from "@carlnotes/contracts/mcpViews"
import { db } from "@carlnotes/db"
import { isMonthlyBudgetCutoffPassed } from "@carlnotes/db/monthlyBudgetCutoffs"
import { topics } from "@carlnotes/db/schema/topics"
import { toEditableTopicFilter } from "@carlnotes/db/topicPermissions"
import { sql } from "drizzle-orm"
import type { ToolCaller } from "./toolCaller"

/**
 * Returns existing editable Topic tags and whether a new Topic can default its podcast on.
 */
export async function loadTopicDraftMcpViewOptions(
	toolCaller: ToolCaller,
): Promise<NonNullable<McpViewData["topicDraftOptions"]>> {
	if (toolCaller.kind !== "user") {
		return { knownTags: [], isPodcastEnabledByDefault: false }
	}
	const [tags, isPastPodcastCutoff] = await Promise.all([
		db
			.selectDistinct({ tag: sql<string>`unnest(${topics.tags})` })
			.from(topics)
			.where(toEditableTopicFilter(toolCaller.userId)),
		isMonthlyBudgetCutoffPassed(toolCaller.userId, "podcastEpisodes"),
	])
	return {
		knownTags: tags.map(({ tag }) => tag).sort((first, second) => first.localeCompare(second)),
		isPodcastEnabledByDefault: !isPastPodcastCutoff,
	}
}
