import { expect, test } from "bun:test"
import {
	CHAT_QUESTION_PLACEHOLDER,
	NEW_TOPIC_CHAT_COPY,
	TOPIC_POST_CHAT_PLACEHOLDER,
	toPrivateChatLabel,
	toPrivateChatPlaceholder,
} from "./chatCopy"

// a private chat is named for what it is about
test("a private chat's label names the post ahead of the topic and the team, and nothing while unknown", () => {
	const subject = { topicPostTitle: "Dialing in", topicName: "Reading", teamName: "Readers" }
	expect(toPrivateChatLabel(subject)).toBe("Private chat about Dialing in")
	expect(toPrivateChatLabel({ ...subject, topicPostTitle: null })).toBe("Private chat about Reading")
	expect(toPrivateChatLabel({ teamName: "Readers" })).toBe("Private chat about Readers")

	// a subject still loading, or with an empty name, reads Private chat alone
	expect(toPrivateChatLabel()).toBe("Private chat")
	expect(toPrivateChatLabel({ topicName: "", teamName: undefined })).toBe("Private chat")
})

// the question box invites a question about the post only while the chat asks about one
test("a private chat's placeholder names the post only while a Topic Post is open", () => {
	const topicPost = { id: "post-1", title: "Dialing in", path: "/topics/topic-1/x/posts/post-1" }
	expect(toPrivateChatPlaceholder({ topicId: "topic-1", topicPost }, false)).toBe(TOPIC_POST_CHAT_PLACEHOLDER)
	expect(TOPIC_POST_CHAT_PLACEHOLDER).toBe("Ask me for a hot take on this post")

	// every other private conversation keeps its own line
	expect(toPrivateChatPlaceholder({ topicId: "topic-1" }, false)).toBe(CHAT_QUESTION_PLACEHOLDER)
	expect(toPrivateChatPlaceholder({ teamId: "team-1" }, false)).toBe(CHAT_QUESTION_PLACEHOLDER)
	expect(toPrivateChatPlaceholder({ newTopic: true }, true)).toBe(NEW_TOPIC_CHAT_COPY.firstTopicPlaceholder)
	expect(toPrivateChatPlaceholder({ newTopic: true }, false)).toBe(NEW_TOPIC_CHAT_COPY.placeholder)
})
