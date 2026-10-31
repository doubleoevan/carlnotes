// the small request and response shapes the routes share and the route contracts freeze: the query and param schemas
// the api validates with, the one-field bodies a write returns, and the lines and events the chat streams send

import { z } from "zod"
import { chatConversation, chatRoomMessage } from "./chat"
import { podcastEpisodeSpeakers } from "./enums"
import { topicInviteBadge } from "./invites"
import { chatToolCallPayload, PODCAST_EPISODE_CHAPTER_POSITION_MAX } from "./payloads"
import { proposeTopicEditPayload, topicDraftPayload } from "./topicPayloads"

// what a write returns
export const okResponse = z.object({ ok: z.literal(true) })

// the home feed's query: every finding, or the unread ones
export const topicFeedQuery = z.object({ all: z.enum(["true", "false"]).optional() })

// the topic page's query: a poll while a scan runs
export const topicPageQuery = z.object({ poll: z.literal("1").optional() })

// a season or podcast episode number from a url, and the queries and params the podcast routes read
export const podcastSeasonOrEpisodeNumberParam = z.coerce.number().pipe(z.int32().positive())
export const seasonPodcastEpisodesQuery = z.object({ season: podcastSeasonOrEpisodeNumberParam })
export const podcastEpisodePageParam = z.object({
	id: z.string(),
	season: podcastSeasonOrEpisodeNumberParam,
	episodeNumber: podcastSeasonOrEpisodeNumberParam,
})
export const podcastEpisodeChapterParam = z.object({
	id: z.string(),
	position: z.coerce.number().int().min(0).max(PODCAST_EPISODE_CHAPTER_POSITION_MAX),
})
export const nextUnplayedPodcastEpisodeQuery = z.object({ topicId: z.string().optional() })

// the chat room routes' queries: the page before a message id, the ids to preview, and the id to resume after
export const chatRoomMessagesQuery = z.object({ before: z.string().optional() })
export const chatRoomLinkPreviewsQuery = z.object({ ids: z.string() })
export const chatRoomEventsQuery = z.object({ after: z.string().optional() })

// the addable topics query: the team whose topics are left out
export const addableTopicsQuery = z.object({ excludeTeam: z.string().optional() })

// the queries the activity, billing state, and team name check routes read
export const userIdQuery = z.object({ userId: z.string().optional() })
export const teamNameQuery = z.object({ name: z.string() })

// what stopping a scan returns: whether one was running
export const stopScanResponse = z.object({ status: z.enum(["idle", "stopped"]) })

// what an attachment upload returns
export const topicAttachmentUploadResponse = z.object({ id: z.string(), filename: z.string() })

// what the app sign-up gate's challenge returns
export const appSignupChallengeResponse = z.object({ challenge: z.string() })

// the pending topic invitations, as the badge poll reads them
export const topicInviteBadgesResponse = z.array(topicInviteBadge)

// the conversation with its topic draft parsed through the draft payload
export const chatConversationResponse = chatConversation.extend({ topicDraft: topicDraftPayload.optional() })

// the topic tool calls a chat turn sends
export const topicToolCalls = z.object({
	topicSaves: z.array(z.string()),
	topicSaveRejections: z.array(z.string()),
	topicDraft: topicDraftPayload.optional(),
	createdTopicId: z.string().optional(),
	isNewTopicChatOpened: z.boolean().optional(),
	proposedTopicEdit: proposeTopicEditPayload.optional(),
	isTopicEditCancelled: z.boolean().optional(),
	chatToolCalls: z.array(chatToolCallPayload).optional(),
})

// one line of the chat reply stream
export const chatReplyLine = z.discriminatedUnion("type", [
	z.object({ type: z.literal("text"), text: z.string() }),
	z.object({ type: z.literal("speaker"), speaker: z.enum(podcastEpisodeSpeakers) }),
	z.object({ type: z.literal("toolCalls"), toolCalls: topicToolCalls }),
	z.object({ type: z.literal("failed") }),
])

// what a chat room shows every member after a tool call
export const roomTopicToolCalls = topicToolCalls
	.pick({ topicSaves: true, topicSaveRejections: true, proposedTopicEdit: true, isTopicEditCancelled: true })
	.extend({ proposedToUserId: z.string().optional() })

// the events a room stream sends: a message, the tool calls, and a ping
export const chatRoomEvent = z.discriminatedUnion("event", [
	z.object({ event: z.literal("message"), data: chatRoomMessage }),
	z.object({ event: z.literal("topicToolCalls"), data: roomTopicToolCalls }),
	z.object({ event: z.literal("ping") }),
])

// the params most routes take
export const idParam = z.object({ id: z.string() })
export const idAndTeamParam = z.object({ id: z.string(), teamId: z.string() })
export const idAndAttachmentParam = z.object({ id: z.string(), attachmentId: z.string() })
export const idAndUserParam = z.object({ id: z.string(), userId: z.string() })
export const userIdParam = z.object({ userId: z.string() })
export const multipartFile = (fieldName: string): z.ZodType => z.object({ [fieldName]: z.any() })

// a recording's multipart post: its voice chat page as json beside the recording's file
export const voiceRecordingMultipart = z.object({ page: z.string(), recording: z.any() })
