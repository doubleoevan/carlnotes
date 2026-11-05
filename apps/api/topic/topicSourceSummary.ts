// legacy Topic responses expose fetched Sources through their original enum
import { fetchedSourceKinds } from "@carlnotes/contracts/enums"
import { toSourceSummary, toSourceValue } from "@carlnotes/contracts/sources"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { sources } from "@carlnotes/db/schema/topics"

/**
 * Projects a fetched Source for released clients, omitting dedicated Personal sources.
 */
export function toTopicSourceSummary(
	topicSource: Pick<typeof sources.$inferSelect, "id" | "kind" | "config" | "status" | "error">,
): TopicResponse["sources"] {
	const sourceKind = fetchedSourceKinds.find((fetchedKind) => fetchedKind === topicSource.kind)
	if (!sourceKind) {
		return []
	}
	return [
		{
			id: topicSource.id,
			sourceKind,
			summary: toSourceSummary(sourceKind, topicSource.config),
			value: toSourceValue(sourceKind, topicSource.config),
			status: topicSource.status,
			error: topicSource.error,
		},
	]
}
