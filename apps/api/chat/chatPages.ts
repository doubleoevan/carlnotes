// the page a private conversation lives on, and the id and the analytics kind a page is named by
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"

// the page that a private conversation lives on: one topic, a whole team, or the new-topic chat, bound to neither
export type ChatPage =
	| { topicId: string; teamId?: undefined; newTopic?: undefined }
	| { teamId: string; topicId?: undefined; newTopic?: undefined }
	| { newTopic: true; topicId?: undefined; teamId?: undefined }

/**
 * Returns the id of the topic or the team a chat page is on, or an empty string for the new-topic chat.
 */
export function toChatPageId(page: ChatPage): string {
	return page.topicId ?? page.teamId ?? ""
}

// which chat a page holds, as an analytics event names it
export type ChatKind = "topic" | "team" | "new_topic" | "room"

/**
 * Returns which chat a page holds: a topic's, a team's, the new-topic chat, or a chat room.
 */
export function toChatKind(page: ChatPage | VoiceChatPage): ChatKind {
	// a voice page names its kind
	if ("kind" in page) {
		return page.kind === "newTopic" ? "new_topic" : page.kind
	}
	if (page.newTopic) {
		return "new_topic"
	}
	return page.teamId ? "team" : "topic"
}
