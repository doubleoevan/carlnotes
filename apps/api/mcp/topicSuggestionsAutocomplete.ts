import { toTopicPath } from "@carlnotes/contracts/seo"
import type { SuggestedTopic } from "@carlnotes/contracts/topicSuggestions"
import { TOPIC_SUGGESTIONS_PAGE_SIZE } from "@carlnotes/contracts/topicSuggestions"
import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { toEditableTopicFilter } from "@carlnotes/db/topicPermissions"
import { appUrl } from "@carlnotes/server/appUrl"
import { and, ilike } from "drizzle-orm"
import { fromCursor, packPageFromWindow } from "./results"

/**
 * Returns literal editable Topic-name suggestions without a model call or a write.
 */
export async function suggestTopicNames({
	userId,
	query = "",
	cursor,
}: {
	userId: string
	query?: string
	cursor?: string
}): Promise<{ topics: SuggestedTopic[]; nextCursor: string | null }> {
	// apply the same edit authority and escape literal search characters before reading five names
	const editable = toEditableTopicFilter(userId)
	const offset = fromCursor(cursor ?? null)
	const rows = await db
		.select({ id: topics.id, name: topics.name })
		.from(topics)
		.where(and(editable, ilike(topics.name, `%${query.replace(/[\\%_]/g, "\\$&")}%`)))
		.orderBy(topics.name, topics.id)
		.offset(offset)
		.limit(TOPIC_SUGGESTIONS_PAGE_SIZE + 1)
	const page = packPageFromWindow(
		rows.map(
			(topic): SuggestedTopic => ({
				...topic,
				prompt: "",
				url: new URL(toTopicPath(topic), appUrl()).href,
				group: "editable",
				relevance: 0,
				isBestMatch: false,
			}),
		),
		{ offset, pageSize: TOPIC_SUGGESTIONS_PAGE_SIZE },
	)
	return { topics: page.items, nextCursor: page.nextCursor }
}
