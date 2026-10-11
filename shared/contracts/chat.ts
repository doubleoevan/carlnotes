// the chat contracts: chat room messages, mentions, rooms, chat turns and their tool calls, and their limits
import { z } from "zod"
import type { avatarSources, chatAttachmentKinds } from "../enums"
import type { ChatToolCall } from "../payloads"
import type { ProposeTopicEditPayload, TopicDraft } from "../topicPayloads"
import { profileIdentity } from "./profiles"

// one chat message attachment shown with a chat message
export type ChatMessageAttachment = { id: string; kind: (typeof chatAttachmentKinds)[number]; name: string }

// a chat message in a team topic's chat room, decrypted for the member viewing it
export type ChatRoomMessage = {
	id: number
	// the author's account if it still exists, and the name recorded at post-time
	authorUserId: string | null
	authorUsername: string
	// the author's current avatar and the version that its url names, null for carl or for a departed member
	authorAvatarSource: (typeof avatarSources)[number] | null
	authorAvatarVersion: string | null
	replyToChatMessageId: number | null
	content: string
	createdAt: string
	// the files this chat message shared with the chat room, earliest first, empty if it shared none
	attachments: ChatMessageAttachment[]
	// the cards for the chat message's first links, empty if it holds none or no link preview is stored
	linkPreviews: ChatLinkPreview[]
}

// the link preview card a link in a chat message renders as, below the chat message's own text
export type ChatLinkPreview = {
	url: string
	title: string | null
	description: string | null
	// the paths this origin serves the page's image and its host's favicon from, null for one it has not stored
	imagePath: string | null
	faviconPath: string | null
	// set when the link is a youtube video, which the card offers to play in place
	youtubeVideoId: string | null
}

// the chat room post body
export const CHAT_ROOM_MESSAGE_MAX_CHARS = 4000

// how long a flag's reason can be
export const FLAG_REASON_MAX_CHARS = 1000

// one page of a chat room's chat messages, and whether an earlier page exists above it
export type ChatRoomMessagePage = { chatMessages: ChatRoomMessage[]; hasEarlierChatMessages: boolean }

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

// how much conversation the model holds word for word. a character budget, about twenty typical chat turns
export const CHAT_MEMORY_CHARS = 40_000

/**
 * Where the uncompacted chat turns start, walking back from the latest turn until the character budget runs out.
 */

export function toUncompactedChatTurnStart(history: { question: string; answer: string }[]): number {
	// spend the budget latest-first
	let budget = CHAT_MEMORY_CHARS
	for (let index = history.length - 1; index >= 0; index--) {
		const chatTurn = history[index]
		budget -= (chatTurn?.question.length ?? 0) + (chatTurn?.answer.length ?? 0)

		// the chat turn that overdraws the budget is the first compacted one, unless it is the latest
		if (budget < 0) {
			return Math.min(index + 1, history.length - 1)
		}
	}
	return 0
}

// how many chat turns a send posts to the llm. the earlier turns beyond the memory budget are compacted
export const CHAT_HISTORY_TURNS = 100

// what one line of a chat reply stream says. text the model writes can never pass for another line,
// since JSON escapes the newline that ends one
export type ChatReplyLine =
	| { type: "text"; text: string }
	| { type: "toolCalls"; toolCalls: TopicToolCalls }
	| { type: "failed" }

/**
 * One line's text, as the chat reply stream sends it.
 */

export function toChatReplyLineText(chatReplyLine: ChatReplyLine): string {
	return `${JSON.stringify(chatReplyLine)}\n`
}

// the toast lines the topic tools leave: one per save and one per rejected change
export type TopicToolToasts = { topicSaves: string[]; topicSaveRejections: string[] }

// what the tools leave for the api client: the toast lines, the topic draft, the topic a create made,
// and whether the new-topic chat opened
export type TopicToolCalls = TopicToolToasts & {
	topicDraft?: TopicDraft
	createdTopicId?: string
	isNewTopicChatOpened?: boolean
	// what carl proposed changing this turn
	proposedTopicEdit?: ProposeTopicEditPayload
	// whether the user turned the proposal down
	isTopicEditCancelled?: boolean
	// the tool calls, sent back as history, so the model reads a save as a call
	chatToolCalls?: ChatToolCall[]
}

// what a chat room shows every member: the toast lines, and who carl proposed a change to. the proposal names its user,
// so one member asking never moves another member's panel
export type RoomTopicToolCalls = Pick<
	TopicToolCalls,
	"topicSaves" | "topicSaveRejections" | "proposedTopicEdit" | "isTopicEditCancelled"
> & {
	proposedToUserId?: string
}

// how much of a compacted earlier answer survives
const COMPACT_ANSWER_CHARS = 280

/**
 * An earlier answer compacted to its opening characters, so the payload and the prompt clip identically.
 */

export function compactChatAnswer(answer: string): string {
	if (answer.length <= COMPACT_ANSWER_CHARS) {
		return answer
	}
	return `${answer.slice(0, COMPACT_ANSWER_CHARS).trimEnd()}…`
}

/**
 * A stored tool call clipped to what the chat turn payload accepts. A tool that returned more than the payload allows,
 * as a web search over a long page does, would otherwise reject every later question in that conversation.
 */

export function toSentToolCall(toolCall: ChatToolCall): ChatToolCall {
	// clip an output past its limit, and drop an input past its own. the output still says what the call did
	const isInputSendable = JSON.stringify(toolCall.input ?? null).length <= CHAT_HISTORY_TOOL_CALL_INPUT_CHARS
	const isOutputSendable = toolCall.output.length <= CHAT_HISTORY_ANSWER_CHARS
	if (isInputSendable && isOutputSendable) {
		return toolCall
	}
	return {
		toolName: toolCall.toolName,
		input: isInputSendable ? toolCall.input : null,
		output: isOutputSendable
			? toolCall.output
			: `${toolCall.output.slice(0, CHAT_HISTORY_ANSWER_CHARS - 1).trimEnd()}…`,
	}
}

/**
 * One chat turn's tool calls as the next question sends them, keeping the newest when a turn called more than the
 * payload accepts. A turn over that count would otherwise reject every later question in that conversation.
 */

export function toSentToolCalls(toolCalls: ChatToolCall[]): ChatToolCall[] {
	return toolCalls.slice(-CHAT_HISTORY_TOOL_CALLS).map(toSentToolCall)
}

// the tools carl calls to put a change on the topic's card or to take it back off, and the ones that save
export const PROPOSE_TOPIC_EDIT_TOOL = "proposeTopicEdit"

export const CANCEL_TOPIC_EDIT_TOOL = "cancelTopicEdit"

export const TOPIC_SAVE_TOOL_NAMES = ["updateTopicPrompt", "addSource", "removeSource", "updateTopicFields"]

/**
 * The proposal a conversation is still sitting on, read from the tools its chat turns called, or null for none.
 * A proposal stands until carl cancels it or a tool saves, so a change already written is never answered twice.
 */

export function toStandingTopicEditCall(toolCalls: ChatToolCall[]): ChatToolCall | null {
	// the last call that opened a proposal or closed one, by cancelling it or by saving
	const lastTopicEditCall = toolCalls
		.filter(
			(toolCall) =>
				toolCall.toolName === PROPOSE_TOPIC_EDIT_TOOL ||
				toolCall.toolName === CANCEL_TOPIC_EDIT_TOOL ||
				TOPIC_SAVE_TOOL_NAMES.includes(toolCall.toolName),
		)
		.at(-1)
	return lastTopicEditCall?.toolName === PROPOSE_TOPIC_EDIT_TOOL ? lastTopicEditCall : null
}

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

/**
 * Attachment text is held to a limit, with a marker naming the cut.
 */

export function clipAttachmentText(text: string): string {
	if (text.length <= CHAT_ATTACHMENT_TEXT_CHARS) {
		return text
	}
	const marker = `\n\n[The attachment is cut here. It runs ${text.length.toLocaleString("en-US")} characters and only the first ${CHAT_ATTACHMENT_TEXT_CHARS.toLocaleString("en-US")} are included.]`
	return `${text.slice(0, CHAT_ATTACHMENT_TEXT_CHARS - marker.length)}${marker}`
}

/**
 * A question with its attachments named in a trailing note.
 */

export function withAttachmentNote(question: string, attachments: { name: string }[]): string {
	if (attachments.length === 0) {
		return question
	}
	const attachmentNote = `[attached: ${attachments.map((attachment) => attachment.name).join(", ")}]`
	return question === "" ? attachmentNote : `${question}\n\n${attachmentNote}`
}

// one persisted chat turn of a stored conversation, replayed on a later page load
export type ChatTurnRow = {
	question: string
	answer: string
	at?: string
	// the tools this chat turn called, sent back with the next question
	toolCalls?: ChatToolCall[]
	attachments: ChatMessageAttachment[]
	// the cards for the question's first links, empty if it holds none or no link preview is stored
	linkPreviews: ChatLinkPreview[]
	// the cards for the answer's first links, under the same rules
	answerLinkPreviews: ChatLinkPreview[]
}

// an attachment the user keeps durably for a topic, with when they added it
export type KeptChatAttachment = {
	id: string
	name: string
	kind: (typeof chatAttachmentKinds)[number]
	at: string
}

// the stored conversation for a topic
export type ChatConversation = {
	chatTurns: ChatTurnRow[]
	canChat: boolean
	isSignupRequired: boolean
	// an exhausted monthly budget keeps the panel open on the upgrade link instead of hiding chat
	isBudgetExhausted: boolean
	keptAttachments: KeptChatAttachment[]
	// whether the user may edit the topic in the chat
	canEditTopic: boolean
	// whether the user owns no topic yet
	isFirstTopic?: boolean
	// how many more topics the plan lets the user hold, and the plan's limit, on the new-topic conversation alone
	topicsRemaining?: number
	topicLimit?: number
	// the topic draft carl has written so far, on the new-topic conversation alone
	topicDraft?: TopicDraft
}
