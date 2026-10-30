// the chat room contracts: messages, mentions, rooms, the limits on a chat turn, and the stored conversation
import { z } from "zod"
import { avatarSources, chatAttachmentKinds, podcastEpisodeSpeakers } from "./enums"
import { profileIdentity } from "./profiles"
import { displayEnum } from "./tolerantReads"
import type { TopicDraft } from "./topicPayloads"

// the chat's name in the app's copy
export const CHAT_NAME = "Coffee Talk"

// one chat message attachment shown with a chat message
export const chatMessageAttachment = z.object({
	id: z.string(),
	kind: displayEnum(chatAttachmentKinds),
	name: z.string(),
})

export type ChatMessageAttachment = z.infer<typeof chatMessageAttachment>

// the link preview card a link in a chat message renders as, below the chat message's own text
export const chatLinkPreview = z.object({
	url: z.string(),
	title: z.string().nullable(),
	description: z.string().nullable(),
	// the paths this origin serves the page's image and its host's favicon from, null for one it has not stored
	imagePath: z.string().nullable(),
	faviconPath: z.string().nullable(),
	// set when the link is a youtube video, which the card offers to play in place
	youtubeVideoId: z.string().nullable(),
})

export type ChatLinkPreview = z.infer<typeof chatLinkPreview>

// a finding's link preview card, or null for a link with none
export const topicFindingLinkPreviewResponse = z.object({ linkPreview: chatLinkPreview.nullable() })

// a chat message in a team topic's chat room, decrypted for the member viewing it
export const chatRoomMessage = z.object({
	id: z.number(),
	// the author's account if it still exists, and the name recorded at post-time
	authorUserId: z.string().nullable(),
	authorUsername: z.string(),
	// the author's current avatar and the version that its url names, null for carl or for a departed member
	authorAvatarSource: displayEnum(avatarSources).nullable(),
	authorAvatarVersion: z.string().nullable(),
	replyToChatMessageId: z.number().nullable(),
	content: z.string(),
	createdAt: z.string(),
	// whether the chat message was spoken, on a member's spoken message and on carl's reply to it
	isSpoken: z.boolean(),
	// the files this chat message shared with the chat room, earliest first, empty if it shared none
	attachments: z.array(chatMessageAttachment),
	// the cards for the chat message's first links, empty if it holds none or no link preview is stored
	linkPreviews: z.array(chatLinkPreview),
})

export type ChatRoomMessage = z.infer<typeof chatRoomMessage>

// the link preview cards of the chat messages a refresh asked for, by chat message id. a json key is a string
export const chatRoomMessageLinkPreviewsResponse = z.object({
	linkPreviews: z.record(z.string(), z.array(chatLinkPreview)),
})

export type ChatRoomMessageLinkPreviewsResponse = z.infer<typeof chatRoomMessageLinkPreviewsResponse>

// what a chat room post returns: the posted chat message's id, and the budget rejection private to the poster
export const chatRoomMessagePostResponse = z.object({
	chatMessageId: z.number(),
	rejectionReason: z.string().nullable(),
})

export type ChatRoomMessagePostResponse = z.infer<typeof chatRoomMessagePostResponse>

// the chat room post body
export const CHAT_ROOM_MESSAGE_MAX_CHARS = 4000

// the sentence that tells the user their budget is spent, in carl's words
export const SPENT_BUDGET_LINE = "Carl is staring at an empty mug."

// the error that rejects a spoken question's transcription once the user's spend is past the spoken questions cutoff
export const SPOKEN_QUESTIONS_PAUSED_ERROR = "spoken questions paused"

// whether spoken questions are allowed, paused by the spoken questions cutoff, or stopped by a spent budget
export type SpokenQuestionsState = { status: "allowed" | "paused" | "budget" }

// how long a flag's reason can be
export const FLAG_REASON_MAX_CHARS = 1000

// one page of a chat room's chat messages, and whether an earlier page exists above it
export const chatRoomMessagePage = z.object({
	chatMessages: z.array(chatRoomMessage),
	hasEarlierChatMessages: z.boolean(),
	// whether voice chat is on, which needs a transcription model and a speech model
	isVoiceChatConfigured: z.boolean(),
})

export type ChatRoomMessagePage = z.infer<typeof chatRoomMessagePage>

// one chat mention still waiting for the user in a chat room
export const chatMention = z.object({
	// the chat room's team, so the badge's link can open that chat room
	teamId: z.string(),
	// the chat message that named the user
	chatMessageId: z.number(),
	authorUsername: z.string(),
	// whether the chat message replied to the user's own, which selects the tooltip's verb
	isReply: z.boolean(),
	// the opening of the chat message, enough to know whether to go read it
	excerpt: z.string(),
})

export type ChatMention = z.infer<typeof chatMention>

// one chat room the chat panel's menu offers: a team's own conversation, or one about a topic it has
export const chatRoom = z.object({
	teamId: z.string(),
	// null on a team's own chat room, which belongs to no topic
	topicId: z.string().nullable(),
	// the team's name, or the topic's on a topic's chat room
	name: z.string(),
	// the team the chat room belongs to, which tells two chat rooms of one topic apart
	teamName: z.string(),
	// the version of the team's own uploaded image, or null for the initials and tint drawn from its name and id
	teamAvatarVersion: z.string().nullable(),
	// the user's unseen mentions in this chat room, badged on the menu row
	chatMentions: z.array(chatMention),
	// the holding team's active members, listed in the switcher row's hover tooltip
	chatRoomMembers: z.array(profileIdentity),
})

export type ChatRoom = z.infer<typeof chatRoom>

// every chat room the signed-in user may open, latest first
export const chatRoomsResponse = z.object({ rooms: z.array(chatRoom) })

// the user's unviewed chat mentions summed over every chat room
export const chatMentionCountResponse = z.object({ count: z.number() })

// how many attachments one chat turn may include, and how large each may run
export const CHAT_MAX_ATTACHMENTS = 4

export const CHAT_ATTACHMENT_TEXT_CHARS = 50_000

export const CHAT_IMAGE_DATA_CHARS = 6_000_000

// a pdf data url's limit. about 10 MB of file under base64, matching what an upload allows
export const CHAT_PDF_DATA_CHARS = 14_000_000

// a video data url's limit. about 18 MB of file under base64, inside the api's request body limit
export const CHAT_VIDEO_DATA_CHARS = 25_000_000

// how long a question may run, shared by the payload limit and the draft box. matches a chat room message
export const CHAT_QUESTION_CHARS = 4_000

// how long a history answer may run. sized past the model's own longest replies, which the history resends
export const CHAT_HISTORY_ANSWER_CHARS = 20_000

// a history question is the asked question plus its stored attachment note, so it gets room for the note
export const CHAT_HISTORY_QUESTION_CHARS = CHAT_QUESTION_CHARS + 1_000

// how many tool calls one replayed chat turn may include, and how long each tool call's input may be as JSON
export const CHAT_HISTORY_TOOL_CALLS = 10

export const CHAT_HISTORY_TOOL_CALL_INPUT_CHARS = 8_000

// how many attachments one user may keep durably against one topic
export const CHAT_ATTACHMENT_KEEP_LIMIT = 20

// how many files one member may have shared with one chat room at a time
export const CHAT_ROOM_ATTACHMENT_LIMIT = 20

// why a sent file was not read: it could not be parsed, it is too large to read before its deadline, or other files kept
// the worker thread busy until then
export type ChatAttachmentRejection = "attachmentUnreadable" | "attachmentTooLarge" | "attachmentBusy"

// the error a chat turn's response names for each file it could not read
export const CHAT_ATTACHMENT_ERRORS: Record<ChatAttachmentRejection, string> = {
	attachmentUnreadable: "attachment unreadable",
	attachmentTooLarge: "attachment too large",
	attachmentBusy: "attachment busy",
}

// why a chat room post's files did not post: one was rejected, they would pass the member's file limit, one is too
// large to read in time, or other files kept the worker thread busy
export type ChatRoomAttachmentRejection =
	| "attachmentRejected"
	| "attachmentLimitReached"
	| "attachmentTooLarge"
	| "attachmentBusy"

// the error a chat room post's 400 response names for each rejection of its files
export const CHAT_ROOM_ATTACHMENT_ERRORS: Record<ChatRoomAttachmentRejection, string> = {
	attachmentRejected: "attachment rejected",
	attachmentLimitReached: "attachment limit reached",
	attachmentTooLarge: CHAT_ATTACHMENT_ERRORS.attachmentTooLarge,
	attachmentBusy: CHAT_ATTACHMENT_ERRORS.attachmentBusy,
}

/**
 * Attachment text is held to a limit, with a marker naming the cut and the attachment's whole length: its characters,
 * or its pages if it is a PDF that stopped reading pages once its text passed the limit.
 */
export function clipAttachmentText(text: string, pdfPageCount?: number): string {
	if (text.length <= CHAT_ATTACHMENT_TEXT_CHARS) {
		return text
	}

	// the whole length in pages for a PDF read partway, else in characters
	const keptChars = CHAT_ATTACHMENT_TEXT_CHARS.toLocaleString("en-US")
	const marker =
		pdfPageCount === undefined
			? `\n\n[The attachment is cut here. It runs ${text.length.toLocaleString("en-US")} characters and only the first ${keptChars} are included.]`
			: `\n\n[The attachment is cut here. It runs ${pdfPageCount.toLocaleString("en-US")} pages and only the first ${keptChars} characters are included.]`
	return `${text.slice(0, CHAT_ATTACHMENT_TEXT_CHARS - marker.length)}${marker}`
}

// one tool a stored chat turn called, as the conversation returns it
export const chatToolCall = z.object({ toolName: z.string(), input: z.unknown(), output: z.string() })

// the podcast episode and the chapter a stored question was asked during, by its position from zero
export const podcastEpisodeChapterRef = z.object({ podcastEpisodeId: z.string(), chapterPosition: z.number() })

// one persisted chat turn of a stored conversation, replayed on a later page load
export const chatTurnRow = z.object({
	question: z.string(),
	answer: z.string(),
	at: z.string().optional(),
	// whether the question was spoken and its reply read aloud
	isSpoken: z.boolean(),
	// the speaker who answered, host unless the cohost answered a podcast chat turn, and the podcast episode chapter
	// that a podcast chat turn was asked during, or null
	speaker: z.enum(podcastEpisodeSpeakers),
	podcastEpisodeChapter: podcastEpisodeChapterRef.nullable(),
	// the tools this chat turn called, sent back with the next question
	toolCalls: z.array(chatToolCall).optional(),
	attachments: z.array(chatMessageAttachment),
	// the cards for the question's first links, empty if it holds none or no link preview is stored
	linkPreviews: z.array(chatLinkPreview),
	// the cards for the answer's first links, under the same rules
	answerLinkPreviews: z.array(chatLinkPreview),
})

export type ChatTurnRow = z.infer<typeof chatTurnRow>

// an attachment the user keeps durably for a topic, with when they added it
export const keptChatAttachment = z.object({
	id: z.string(),
	name: z.string(),
	kind: displayEnum(chatAttachmentKinds),
	at: z.string(),
})

export type KeptChatAttachment = z.infer<typeof keptChatAttachment>

// the stored conversation for a topic
export const chatConversation = z.object({
	chatTurns: z.array(chatTurnRow),
	canChat: z.boolean(),
	isSignupRequired: z.boolean(),
	// an exhausted monthly budget keeps the panel open on the upgrade link instead of hiding chat
	isBudgetExhausted: z.boolean(),
	// whether voice chat is on, which needs a transcription model and a speech model
	isVoiceChatConfigured: z.boolean(),
	keptAttachments: z.array(keptChatAttachment),
	// whether the user may edit the topic in the chat
	canEditTopic: z.boolean(),
	// whether the user owns no topic yet
	isFirstTopic: z.boolean().optional(),
	// how many more topics the plan lets the user hold, and the plan's limit, on the new-topic conversation alone
	topicsRemaining: z.number().optional(),
	topicLimit: z.number().optional(),
	// the topic draft carl has written so far, on the new-topic conversation alone
	topicDraft: z.custom<TopicDraft>((value) => typeof value === "object" && value !== null).optional(),
})

export type ChatConversation = z.infer<typeof chatConversation>
