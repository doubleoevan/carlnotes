// the chat response contracts: each one parses the body its route writes, and the tolerant form keeps what it can
import { describe, expect, test } from "bun:test"
import {
	type ChatRoomMessage,
	chatConversation,
	chatMentionCountResponse,
	chatRoomMessageLinkPreviewsResponse,
	chatRoomMessagePage,
	chatRoomMessagePostResponse,
	chatRoomsResponse,
	topicFindingLinkPreviewResponse,
} from "./chat"
import { UNKNOWN_CASE } from "./enums"
import { takeDroppedEntryCount, toTolerantResponseSchema } from "./tolerantReads"
import { EMPTY_TOPIC_DRAFT } from "./topicPayloads"

// a link preview card with an image and no video
const linkPreview = {
	url: "https://example.com/grinders",
	title: "Grinders get quiet",
	description: null,
	imagePath: "/api/topics/topic-1/rooms/team-1/link-previews/7/image",
	faviconPath: null,
	youtubeVideoId: null,
}

// a member's chat room message with one shared image and one card
const chatRoomMessage: ChatRoomMessage = {
	id: 1,
	authorUserId: "member-1",
	authorUsername: "ana",
	authorAvatarSource: "upload",
	authorAvatarVersion: "v3",
	replyToChatMessageId: null,
	content: "hello room https://example.com/grinders",
	createdAt: "2026-08-18T12:00:00.000Z",
	isSpoken: false,
	attachments: [{ id: "attachment-1", kind: "image", name: "burrs.png" }],
	linkPreviews: [linkPreview],
}

// a stored conversation with one podcast chat turn and one kept attachment, on the new-topic chat
const conversation = {
	chatTurns: [
		{
			question: "Why does the corner test matter?",
			answer: "Because corners collect the most dust.",
			at: "2026-08-18T12:00:00.000Z",
			isSpoken: true,
			speaker: "cohost" as const,
			podcastEpisodeChapter: { podcastEpisodeId: "podcast-episode-1", chapterPosition: 2 },
			toolCalls: [{ toolName: "addSource", input: { url: "https://example.com/feed" }, output: "Saved." }],
			attachments: [],
			linkPreviews: [],
			answerLinkPreviews: [linkPreview],
		},
	],
	canChat: true,
	isSignupRequired: false,
	isBudgetExhausted: false,
	isVoiceChatConfigured: true,
	keptAttachments: [{ id: "kept-1", name: "notes.pdf", kind: "pdf" as const, at: "2026-08-18T12:00:00.000Z" }],
	canEditTopic: true,
	isFirstTopic: true,
	topicsRemaining: 2,
	topicLimit: 3,
	topicDraft: { ...EMPTY_TOPIC_DRAFT, name: "Robot vacuums" },
}

// one chat room the panel's menu offers, with one mention waiting
const chatRoom = {
	teamId: "team-1",
	topicId: "topic-1",
	name: "Robot vacuums",
	teamName: "Dust busters",
	teamAvatarVersion: null,
	chatMentions: [
		{ teamId: "team-1", chatMessageId: 4, authorUsername: "ana", isReply: true, excerpt: "@bo did you see" },
	],
	chatRoomMembers: [{ userId: "member-1", username: "ana", avatarSource: "upload", avatarVersion: "v3" }],
}

describe("the chat response contracts", () => {
	test("a chat room message page parses with its chat messages", () => {
		const page = { chatMessages: [chatRoomMessage], hasEarlierChatMessages: true, isVoiceChatConfigured: false }
		expect(chatRoomMessagePage.parse(page)).toEqual(page)
	})

	test("a conversation parses with its chat turns, kept attachments, and new-topic fields", () => {
		expect(chatConversation.parse(conversation)).toEqual(conversation)
	})

	test("a chat rooms response, a mention count, a post, and the link preview responses parse", () => {
		expect(chatRoomsResponse.parse({ rooms: [chatRoom] })).toEqual({ rooms: [chatRoom] })
		expect(chatMentionCountResponse.parse({ count: 3 })).toEqual({ count: 3 })
		expect(chatRoomMessagePostResponse.parse({ chatMessageId: 8, rejectionReason: null })).toEqual({
			chatMessageId: 8,
			rejectionReason: null,
		})
		expect(chatRoomMessageLinkPreviewsResponse.parse({ linkPreviews: { 1: [linkPreview] } })).toEqual({
			linkPreviews: { "1": [linkPreview] },
		})
		expect(topicFindingLinkPreviewResponse.parse({ linkPreview: null })).toEqual({ linkPreview: null })
	})

	test("the tolerant page keeps an unknown attachment kind and drops a malformed chat message", () => {
		// an attachment kind the build does not know shows as unknown, and a chat message with no id is dropped
		takeDroppedEntryCount()
		const tolerantPage = toTolerantResponseSchema(chatRoomMessagePage).parse({
			chatMessages: [
				{ ...chatRoomMessage, attachments: [{ id: "attachment-2", kind: "archive", name: "burrs.zip" }] },
				{ ...chatRoomMessage, id: "not a number" },
			],
			hasEarlierChatMessages: false,
			isVoiceChatConfigured: false,
		})
		expect(tolerantPage.chatMessages.map((entry) => entry.attachments[0]?.kind)).toEqual([UNKNOWN_CASE])
		expect(takeDroppedEntryCount()).toBe(1)
	})

	test("the tolerant conversation keeps a strict speaker", () => {
		const unknownSpeakerConversation = {
			...conversation,
			chatTurns: [{ ...conversation.chatTurns[0], speaker: "guest" }],
		}
		expect(toTolerantResponseSchema(chatConversation).parse(unknownSpeakerConversation).chatTurns).toEqual([])
		expect(takeDroppedEntryCount()).toBe(1)
	})
})
