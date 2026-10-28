import type { ChatLinkPreview, ChatRoomMessage } from "@carlnotes/contracts/chat"
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { TOPIC_TUTORIAL_VIDEO, toYoutubeWatchUrl } from "@carlnotes/contracts/youtube"
import type { ChatTurn } from "./chatTurns"
import { NEW_TOPIC_CHAT_WORDS } from "./safeChatMarkdown"

// both component browsers use fictional, deterministic conversations
export const CHAT_STORY_NOW = Date.parse("2026-10-27T12:00:00Z")
export const CHAT_STORY_AUTHOR = { userId: null, username: "reader", avatarVersion: null }
export const CHAT_STORY_VIDEO_PREVIEW: ChatLinkPreview = {
	url: toYoutubeWatchUrl(TOPIC_TUTORIAL_VIDEO.youtubeVideoId),
	title: TOPIC_TUTORIAL_VIDEO.name,
	description: null,
	imagePath: TOPIC_TUTORIAL_VIDEO.thumbnailPath,
	faviconPath: null,
	youtubeVideoId: TOPIC_TUTORIAL_VIDEO.youtubeVideoId,
}
export const CHAT_STORY_MARKDOWN = `Two useful changes, with the details kept together.

| Approach | Why it helps |
| --- | --- |
| **Small steps** | Review one change at a time. |
| Read the [source](https://example.com) | Keep evidence alongside the answer. |

Raw HTML stays text: <b>not a rendered tag</b>. [Unsafe destination](javascript:alert(1)) stays readable.

${NEW_TOPIC_CHAT_WORDS}`
export const CHAT_STORY_DRAFT: TopicDraft = {
	...EMPTY_TOPIC_DRAFT,
	name: "Better coffee at home",
	prompt: "Practical research on brewing coffee, with sources and clear tradeoffs.",
	tags: ["coffee", "research"],
	frequency: "weekly",
	maxTopicFindings: 10,
	visibility: "invite",
	team: { teamId: "story-team", name: "Coffee Club" },
	inviteEmails: ["reader@example.test"],
	isPodcastEnabled: true,
	sources: [{ sourceOption: "rss", value: "https://example.com/feed.xml" }],
}

/** Return a complete private turn shared by web and native stories. */
export function toStoryChatTurn(overrides: Partial<ChatTurn> = {}): ChatTurn {
	return {
		spokenAnswerKey: "story-turn",
		speaker: "host",
		podcastEpisodeChapter: null,
		question: "What changed, Carl?",
		answer: CHAT_STORY_MARKDOWN,
		rejection: null,
		at: CHAT_STORY_NOW - 60_000,
		attachments: [],
		linkPreviews: [],
		answerLinkPreviews: [],
		...overrides,
	}
}

/** Return a complete room message without reading an account's history. */
export function toStoryRoomMessage(overrides: Partial<ChatRoomMessage> = {}): ChatRoomMessage {
	return {
		id: 2,
		content: "@carl, what would you change?",
		authorUserId: "story-reader",
		authorUsername: "reader",
		authorAvatarSource: null,
		authorAvatarVersion: null,
		replyToChatMessageId: null,
		createdAt: "2026-10-27T11:59:00Z",
		isSpoken: false,
		attachments: [],
		linkPreviews: [],
		...overrides,
	}
}
