// a published Topic Post's stored summary: the read of what it is written from, and the write that keeps it
import { db } from "@carlnotes/db"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { eq, sql } from "drizzle-orm"
import { summarizeTopicPost } from "./summarizeTopicPost"

/**
 * Writes a published Topic Post's summary from its title and text, billed to its author, and stores it. Returns the
 * version of the text the summary was written from, or null for a draft and a deleted post, which have none to write.
 * A post still at summarizedVersion keeps the summary it has.
 */
export async function writeStoredTopicPostSummary(
	topicPostId: string,
	summarizedVersion?: number | null,
): Promise<number | null> {
	// the post's words at their version, and who pays for the call
	const [topicPostRow] = await db
		.select({
			title: topicPosts.title,
			html: topicPosts.html,
			version: topicPosts.version,
			authorUserId: topicPosts.authorUserId,
			publishedAt: topicPosts.publishedAt,
		})
		.from(topicPosts)
		.where(eq(topicPosts.id, topicPostId))
	if (!topicPostRow?.publishedAt) {
		return null
	}

	// a text that has not changed since its summary was written needs no second one
	if (topicPostRow.version === summarizedVersion) {
		return topicPostRow.version
	}

	// write the summary on the author's key, and keep it on the post with what every summary of it cost together
	const { summary, costDollars } = await summarizeTopicPost({
		title: topicPostRow.title,
		html: topicPostRow.html,
		litellmApiKey: await loadOrProvisionUserLiteLLMKey(topicPostRow.authorUserId),
	})
	await db
		.update(topicPosts)
		.set({ summary, cost: sql`${topicPosts.cost} + ${costDollars}` })
		.where(eq(topicPosts.id, topicPostId))
	return topicPostRow.version
}
