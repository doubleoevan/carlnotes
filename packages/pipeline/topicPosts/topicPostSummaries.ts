// a published Topic Post's stored summary: the read of what it is written from, and the write that keeps it
import { db } from "@carlnotes/db"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { eq, sql } from "drizzle-orm"
import { summarizeTopicPost } from "./summarizeTopicPost"

/**
 * Writes a published Topic Post's summary from its title and text, billed to its author, and stores it while the post
 * still has that title and text. A draft and a deleted post have none to write.
 */
export async function writeStoredTopicPostSummary(topicPostId: string): Promise<void> {
	// the post's words, and who pays for the call
	const [topicPostRow] = await db
		.select({
			title: topicPosts.title,
			html: topicPosts.html,
			authorUserId: topicPosts.authorUserId,
			publishedAt: topicPosts.publishedAt,
		})
		.from(topicPosts)
		.where(eq(topicPosts.id, topicPostId))
	if (!topicPostRow?.publishedAt) {
		return
	}

	// write the summary on the author's key
	const { title, html } = topicPostRow
	const { summary, costDollars } = await summarizeTopicPost({
		title,
		html,
		litellmApiKey: await loadOrProvisionUserLiteLLMKey(topicPostRow.authorUserId),
	})

	// keep the summary only if an edit saved during the call left the words alone, so an older summary never replaces a
	// newer one. the call's cost adds to what every summary of the post cost together either way
	const isSameText = sql`${topicPosts.title} = ${title} and ${topicPosts.html} = ${html}`
	await db
		.update(topicPosts)
		.set({
			summary: sql`case when ${isSameText} then ${summary} else ${topicPosts.summary} end`,
			cost: sql`${topicPosts.cost} + ${costDollars}`,
		})
		.where(eq(topicPosts.id, topicPostId))
}
