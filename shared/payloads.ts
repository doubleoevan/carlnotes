// the request payload schemas the api validates and the ui sends, with the types inferred from them
import { z } from "zod"
import {
	CHAT_ATTACHMENT_TEXT_CHARS,
	CHAT_HISTORY_ANSWER_CHARS,
	CHAT_HISTORY_QUESTION_CHARS,
	CHAT_HISTORY_TOOL_CALL_INPUT_CHARS,
	CHAT_HISTORY_TOOL_CALLS,
	CHAT_HISTORY_TURNS,
	CHAT_IMAGE_DATA_CHARS,
	CHAT_MAX_ATTACHMENTS,
	CHAT_PDF_DATA_CHARS,
	CHAT_QUESTION_CHARS,
	CHAT_ROOM_MESSAGE_MAX_CHARS,
	CHAT_VIDEO_DATA_CHARS,
	FLAG_REASON_MAX_CHARS,
} from "./contracts/chat"
import { inviteSources } from "./contracts/invites"
import { NOTE_NAME_MAX_CHARS, NOTE_UPDATE_MAX_CHARS } from "./contracts/notes"
import {
	conversationChatTurnKinds,
	inviteAccesses,
	noteVisibilities,
	podcastEpisodeSpeakers,
	ratings,
	teamRoles,
} from "./enums"
import { topicDraftPayload } from "./topicPayloads"

// the shape that every chat attachment includes whatever its kind
const chatAttachmentFields = {
	name: z.string().trim().min(1).max(200),
	keep: z.boolean().default(false),
}

// the rating mutation body. up or down sets the topic finding's rating and null clears it
export const ratingPayload = z.object({ rating: z.enum(ratings).nullable() })

// the consumed mutation body. true marks the topic finding consumed for the current user and false unmarks it
export const consumedPayload = z.object({ isConsumed: z.boolean() })

// the bookmark mutation body. true sets the topic finding bookmark for the current user and false clears it
export const bookmarkPayload = z.object({ isBookmarked: z.boolean() })

// an avatar decode failure report: the picked file's content type and byte size
export const avatarDecodeFailurePayload = z.object({
	contentType: z.string().max(100),
	byteSize: z.number().int().nonnegative(),
})

export const chatRoomMessagePayload = z
	.object({
		content: z.string().trim().max(CHAT_ROOM_MESSAGE_MAX_CHARS),
		replyToChatMessageId: z.number().int().positive().nullable().optional(),
		// whether the chat message was spoken, which marks it and carl's reply and has him answer out loud
		isSpoken: z.boolean().default(false),
		// the shared files going with the chat message, under the per-chat message limit
		get attachments() {
			return z.array(chatAttachmentPayload).max(CHAT_MAX_ATTACHMENTS).default([])
		},
	})
	// a chat message may be attachments alone, but never nothing at all
	.refine((chatMessage) => chatMessage.content !== "" || chatMessage.attachments.length > 0)

// a user's own words about a finding to use for tuning later
export const findingFeedbackPayload = z.object({ feedback: z.string().trim().min(1).max(2000) })

// the signup-gate body. oauth never calls this endpoint, only the password path needs turnstile
export const signupGatePayload = z.object({ turnstileToken: z.string() })

// the checkout body. which paid plan and billing interval to subscribe to through Stripe Checkout
export const checkoutPayload = z.object({
	plan: z.enum(["plus", "premium"]),
	billingInterval: z.enum(["monthly", "yearly"]),
})

// the update username body. the validation rules live in toUsernameRejection
export const usernamePayload = z.object({ username: z.string() })

// the flag issue body. the subject is a topic, profile, or team id, named by which kind it is so the api can look it up
export const flagContentPayload = z.object({
	subjectKind: z.enum(["topic", "profile", "team"]),
	subjectId: z.string().min(1),
	reason: z.string().trim().min(1).max(FLAG_REASON_MAX_CHARS),
})

export type FlagContentPayload = z.infer<typeof flagContentPayload>

// the invite-delete body, named by its invite id
export const inviteDeletePayload = z.object({ inviteId: z.string() })

// the create-team body from the shared create modal
export const createTeamPayload = z.object({
	name: z.string().trim().min(1).max(80),
	topicIds: z.array(z.string()).max(50),
	// the description the same modal writes on an edit, optional at both ends
	description: z.string().trim().max(500).nullable().optional(),
	// whether the page opens to anyone from the start. absent stays private, the default
	isPublic: z.boolean().optional(),
})

export type CreateTeamPayload = z.infer<typeof createTeamPayload>

// the leader's team edits. the public toggle's confirmation lives in the ui
export const updateTeamPayload = z.object({
	name: z.string().trim().min(1).max(80).optional(),
	description: z.string().trim().max(500).nullable().optional(),
	isPublic: z.boolean().optional(),
})

export type UpdateTeamPayload = z.infer<typeof updateTeamPayload>

// attaching one topic to a team, setting one member's role, and a member's own member-visibility opt-out
export const addTopicPayload = z.object({ topicId: z.string() })

export const memberRolePayload = z.object({ role: z.enum(teamRoles) })

export const memberVisibilityPayload = z.object({ isMemberVisible: z.boolean() })

// the invite-access settings body
export const inviteAccessPayload = z.object({ inviteAccess: z.enum(inviteAccesses) })

// the user-invite body: exactly one identifier, a username or an email address
export const userInvitePayload = z
	.object({
		username: z.string().trim().min(1).optional(),
		email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
	})
	.refine((payload) => (payload.username === undefined) !== (payload.email === undefined), {
		message: "exactly one of username or email",
	})

export type UserInvitePayload = z.infer<typeof userInvitePayload>

export const inviteCreatePayload = z.object({ source: z.enum(inviteSources) })

// the subscription email-preference mutation body, independent of the subscription's active state
export const subscriptionEmailPayload = z.object({
	isEmailEnabled: z.boolean(),
	// whose subscription to write, for an admin acting on somebody else's. absent means the caller's own
	subscriberUserId: z.string().optional(),
})

// one attachment on a chat turn. each kind has its own field requirements
export const chatAttachmentPayload = z.discriminatedUnion("kind", [
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("image"),
		dataUrl: z.string().max(CHAT_IMAGE_DATA_CHARS).startsWith("data:image/"),
	}),
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("pdf"),
		dataUrl: z.string().max(CHAT_PDF_DATA_CHARS).startsWith("data:application/pdf"),
	}),
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("document"),
		dataUrl: z.string().max(CHAT_PDF_DATA_CHARS).startsWith("data:application/vnd.openxmlformats-"),
	}),
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("text"),
		text: z.string().max(CHAT_ATTACHMENT_TEXT_CHARS),
	}),
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("video"),
		dataUrl: z.string().max(CHAT_VIDEO_DATA_CHARS).startsWith("data:video/"),
	}),
])

export type ChatAttachment = z.infer<typeof chatAttachmentPayload>

// one tool a chat turn called, with its input and what it returned
export const chatToolCallPayload = z
	.object({
		toolName: z.string().max(80),
		input: z.unknown(),
		output: z.string().max(CHAT_HISTORY_ANSWER_CHARS),
	})
	.refine(
		(toolCall) => JSON.stringify(toolCall.input ?? null).length <= CHAT_HISTORY_TOOL_CALL_INPUT_CHARS,
		"tool call input too long",
	)

export type ChatToolCall = z.infer<typeof chatToolCallPayload>

// a chat turn's question plus the conversation so far
export const chatTurnPayload = z
	.object({
		question: z.string().trim().max(CHAT_QUESTION_CHARS),
		history: z
			.array(
				z.object({
					question: z.string().max(CHAT_HISTORY_QUESTION_CHARS),
					answer: z.string().max(CHAT_HISTORY_ANSWER_CHARS),
					// the tools the chat turn called, replayed so the model reads a save as a call
					toolCalls: z.array(chatToolCallPayload).max(CHAT_HISTORY_TOOL_CALLS).optional(),
				}),
			)
			.max(CHAT_HISTORY_TURNS)
			.default([]),
		attachments: z.array(chatAttachmentPayload).max(CHAT_MAX_ATTACHMENTS).default([]),
		// the chat's new topic draft as the browser holds it
		topicDraft: topicDraftPayload.optional(),
		// whether the question was spoken, which marks the chat turn and has carl answer out loud
		isSpoken: z.boolean().default(false),
	})
	// a chat turn may be attachments alone, but never nothing at all
	.refine((chatTurn) => chatTurn.question !== "" || chatTurn.attachments.length > 0)

export type ChatTurnPayload = z.infer<typeof chatTurnPayload>

// one earlier chat turn as a chat turn's history sends it
export type ChatHistoryTurn = ChatTurnPayload["history"][number]

// the longest podcast episode id a chapter reference takes
const PODCAST_EPISODE_ID_MAX_CHARS = 64

// a chapter position well past any podcast episode's chapters, which keeps a chapter lookup inside a postgres integer
export const PODCAST_EPISODE_CHAPTER_POSITION_MAX = 999

// the podcast episode and the chapter a question was asked during, by its position from zero
export const podcastEpisodeChapterPayload = z.object({
	podcastEpisodeId: z.string().min(1).max(PODCAST_EPISODE_ID_MAX_CHARS),
	chapterPosition: z.number().int().min(0).max(PODCAST_EPISODE_CHAPTER_POSITION_MAX),
})

export type PodcastEpisodeChapterRef = z.infer<typeof podcastEpisodeChapterPayload>

// a topic chat turn, which may be a spoken question asked from the podcast player during one chapter of a podcast
// episode. a podcast question is always spoken and never sends an attachment
export const topicChatTurnPayload = chatTurnPayload
	.and(z.object({ podcastEpisodeChapter: podcastEpisodeChapterPayload.optional() }))
	.refine(
		(chatTurn) => !chatTurn.podcastEpisodeChapter || (chatTurn.isSpoken && chatTurn.attachments.length === 0),
		"a podcast question is spoken and has no attachment",
	)

export type TopicChatTurnPayload = z.infer<typeof topicChatTurnPayload>

// the longest spoken part of a reply that the speech route speaks in one call
export const SPOKEN_PART_CHARS = 2000

// the longest spoken question, in seconds. the recorder stops there, the event payload bounds there, and the
// transcode cuts one second past it
export const VOICE_RECORDING_MAX_SECONDS = 60

// the chat page a voice request names, which the api authorizes as it would a chat turn on that page
export const voiceChatPagePayload = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("topic"), topicId: z.string().min(1) }),
	z.object({ kind: z.literal("team"), teamId: z.string().min(1) }),
	z.object({ kind: z.literal("newTopic") }),
	// a chat room, the team's own if the topic is null
	z.object({ kind: z.literal("room"), topicId: z.string().min(1).nullable(), teamId: z.string().min(1) }),
])

export type VoiceChatPage = z.infer<typeof voiceChatPagePayload>

// the speech body: the page, one spoken part of a reply to speak, and the speaker who gave the reply,
// carl unless vienna answered a question asked from the podcast player
export const spokenAnswerPayload = z.object({
	page: voiceChatPagePayload,
	text: z.string().trim().min(1).max(SPOKEN_PART_CHARS),
	speaker: z.enum(podcastEpisodeSpeakers).default("host"),
})

// the speech body as the browser sends it, which may leave out the speaker
export type SpokenAnswerPayload = z.input<typeof spokenAnswerPayload>

// the spoken events body: the page and what the browser measured, a spoken question's timings or a play tap
export const spokenEventPayload = z.object({
	page: voiceChatPagePayload,
	event: z.discriminatedUnion("kind", [
		z.object({
			kind: z.literal("question"),
			secondsRecorded: z.number().int().min(0).max(VOICE_RECORDING_MAX_SECONDS),
			transcriptionMs: z.number().int().min(0),
			// from the send tap to the reply's first spoken word, absent if nothing played
			firstSpokenWordMs: z.number().int().min(0).optional(),
			// whether the question was asked from the chat or from the podcast player
			chatTurnKind: z.enum(conversationChatTurnKinds).default("private"),
		}),
		z.object({ kind: z.literal("answer_played") }),
	]),
})

export type SpokenEventPayload = z.infer<typeof spokenEventPayload>

// the admin role-change body. an admin cannot remove their own admin role, enforced server-side
export const setRolePayload = z.object({ role: z.enum(["admin", "user"]) })

// the admin budget-override body: a per-user monthly limit in cents, or null to fall back to the plan's backstop
export const budgetOverridePayload = z.object({ budgetOverrideCents: z.number().int().nonnegative().nullable() })

// what the player saves as a user listens. the user's progress, whether playback just started,
// and whether playback ended
export const podcastEpisodeListenPayload = z.object({
	progressSeconds: z.number().int().min(0),
	isPlaybackStart: z.boolean().optional(),
	isCompleted: z.boolean().optional(),
})

export type PodcastEpisodeListenPayload = z.infer<typeof podcastEpisodeListenPayload>

// the subscription toggle body. true subscribes the current user and false unsubscribes them
export const subscriptionPayload = z.object({ isSubscribed: z.boolean() })

export const noteSyncPayload = z.object({ update: z.string().min(1).max(NOTE_UPDATE_MAX_CHARS) })

export const noteCreatePayload = z.object({
	name: z.string().trim().min(1).max(NOTE_NAME_MAX_CHARS),
	visibility: z.enum(noteVisibilities),
})

// the note update body. a rename takes edit access, a visibility change is the owner's alone
export const noteUpdatePayload = z.object({
	name: z.string().trim().min(1).max(NOTE_NAME_MAX_CHARS).optional(),
	visibility: z.enum(noteVisibilities).optional(),
})

// one spoken turn of a podcast episode. its speaker, its words as speech, and an optional short delivery style
export const podcastEpisodeTurnPayload = z.object({
	speaker: z.enum(podcastEpisodeSpeakers),
	text: z.string().trim().min(1),
	style: z.string().trim().min(1).optional(),
})

export type PodcastEpisodeTurn = z.infer<typeof podcastEpisodeTurnPayload>

// one chapter of a podcast episode's script. the Finding that the chapter narrates, its title, and its turns
export const podcastEpisodeChapterScriptPayload = z.object({
	findingId: z.string().min(1),
	title: z.string().trim().min(1),
	turns: z.array(podcastEpisodeTurnPayload).min(1),
})

export type PodcastEpisodeChapterScript = z.infer<typeof podcastEpisodeChapterScriptPayload>
