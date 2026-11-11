// the topic chat prompt's blocks for a question asked from a Topic Post's page: the chat-topic-post fragment, and the
// post with its shared Comments
import { toSharedCommentLine } from "@carlnotes/contracts/socialText"
import { fetchPromptTemplate } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import type { TopicPostChatContext } from "./retrieveTopicPost"

/**
 * Returns the chat-topic-post fragment for a question asked from a Topic Post's page, or an empty block without a
 * fetch for any other chat turn.
 */
export async function toTopicPostQuestionBlock(topicPost: TopicPostChatContext | undefined): Promise<string> {
	if (!topicPost) {
		return ""
	}
	const topicPostFragment = await fetchPromptTemplate("chat-topic-post")
	return writePrompt(topicPostFragment.template, {})
}

/**
 * Returns the post block: the post's title and text, then each shared Comment as its author's username and what they
 * wrote, or a line saying none is shared.
 */
export function toTopicPostBlock({ title, text, comments }: TopicPostChatContext): string {
	const commentLines =
		comments.length > 0
			? comments.map(({ username, body }) => toSharedCommentLine({ username, body }))
			: ["No comment is shared on this post."]
	return [`Post: ${title}`, "", text, "", "Comments readers shared on this post:", ...commentLines].join("\n")
}
