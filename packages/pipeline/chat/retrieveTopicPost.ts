// the Topic Post a question asked from its page reads: the post's title and text, and its shared Comments the reader
// may see
import { toHtmlText } from "@carlnotes/contracts/text"
import { db } from "@carlnotes/db"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { loadTopicPostSharedCommentTexts } from "@carlnotes/db/sharedComments"
import { and, eq, isNotNull } from "drizzle-orm"

// how much of a post's text, and how many of its shared Comments, one chat turn reads
const MAX_CHAT_POST_CHARS = 16_000
const MAX_CHAT_POST_COMMENTS = 20

// what a chat turn reads of a Topic Post: its id, its title and text, and each shared Comment with its author's
// username
export type TopicPostChatContext = {
	topicPostId: string
	title: string
	text: string
	comments: { username: string; body: string }[]
}

// the Topic a chat turn is on, the Topic Post it names, and the reader who asks
type LoadTopicPostChatContextOptions = { topicId: string; topicPostId: string; userId: string }

/**
 * Loads what a chat turn reads of a Topic Post: its text, limited in length, and its Comments that are shared and
 * shown to the reader, which leaves out an author under an admin block or in a user block with the reader. Returns
 * null for a draft, a post that is gone, and a post of another Topic.
 */
export async function loadTopicPostChatContext({
	topicId,
	topicPostId,
	userId,
}: LoadTopicPostChatContextOptions): Promise<TopicPostChatContext | null> {
	// the published post on this Topic, and its shared Comments
	const [[topicPost], sharedComments] = await Promise.all([
		db
			.select({ title: topicPosts.title, html: topicPosts.html })
			.from(topicPosts)
			.where(and(eq(topicPosts.id, topicPostId), eq(topicPosts.topicId, topicId), isNotNull(topicPosts.publishedAt)))
			.limit(1),
		loadTopicPostSharedCommentTexts(topicPostId, MAX_CHAT_POST_COMMENTS, userId),
	])
	if (!topicPost) {
		return null
	}

	// a Comment by a closed account has no name to credit, and is left out
	return {
		topicPostId,
		title: topicPost.title,
		text: toHtmlText(topicPost.html).slice(0, MAX_CHAT_POST_CHARS),
		comments: sharedComments.flatMap(({ username, body }) => (username ? [{ username, body }] : [])),
	}
}
