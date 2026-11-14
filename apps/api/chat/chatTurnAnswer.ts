// answering an allowed chat turn on any private chat page: the podcast episode chapter it may name, its attachments,
// the proposal it may answer, its tools, and the streamed reply
import { CHAT_ATTACHMENT_ERRORS, type ChatAttachmentRejection } from "@carlnotes/contracts/chat"
import { withAttachmentNote } from "@carlnotes/contracts/chatQuestionNotes"
import type { TopicChatTurnPayload } from "@carlnotes/contracts/payloads"
import { ADMIN_QUOTA } from "@carlnotes/contracts/plans"
import { EMPTY_TOPIC_DRAFT, type TopicDraft, type TopicDraftTeam } from "@carlnotes/contracts/topicPayloads"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { reserveUserSpend, toReleaseOnFailure } from "@carlnotes/models/spendReservations"
import type { ChatTurnInput } from "@carlnotes/pipeline/chat/chatMessages"
import { maxChatTurnDollars, toChatTurnMessageChars } from "@carlnotes/pipeline/chat/chatTurnCost"
import { streamChatReply } from "@carlnotes/pipeline/chat/index"
import {
	loadPodcastEpisodeChapterContext,
	type PodcastEpisodeChapterContext,
} from "@carlnotes/pipeline/chat/retrievePodcastEpisodeChapter"
import { loadTopicPostChatContext, type TopicPostChatContext } from "@carlnotes/pipeline/chat/retrieveTopicPost"
import type { Context } from "hono"
import { type AnalyticsProperties, toAnalyticsProperties } from "../currentUser"
import {
	type ChatTurnToolCalls,
	toEmptyChatTurnToolCalls,
	toOpenNewTopicChatTool,
	toTopicEditPreviewTools,
} from "../tool/chatTools"
import {
	toNewTopicChatTools,
	toProposeNewTopicTool,
	toSuggestTopicSourcesTool,
	toTopicDraftOnDefaultTeam,
} from "../tool/newTopicChatTools"
import { loadTopicDraft } from "../topic/topicDrafts"
import { resolveChatAttachments } from "./chatAttachmentParts"
import type { ChatPage } from "./chatPages"
import { answerChatProposal } from "./chatProposals"
import { type ChatTurnAuthorization, rejectChatTurn } from "./chatTurnAuthorization"
import { streamChatTurn } from "./chatTurnStream"
import { saveLinkPreviews } from "./linkPreviews"

// the status a chat turn responds with for a file it could not read: a file too large to read in time takes the 413
// the body limit returns for an oversized file, a file that waited behind other files a 503 the browser may send
// again, and a file that cannot be parsed a 422
const ATTACHMENT_REJECTION_STATUSES = {
	attachmentTooLarge: 413,
	attachmentBusy: 503,
	attachmentUnreadable: 422,
} as const

// how long the browser waits before sending a file again that waited behind other files, in seconds
const BUSY_ATTACHMENT_RETRY_AFTER_SECONDS = 30

// an allowed chat turn to answer: its page, the gate's decision, and the question with its attachments
export type AnswerChatTurnOptions = {
	page: ChatPage
	authorization: ChatTurnAuthorization & { status: "allowed" }
	// a topic chat turn may name the podcast episode chapter it was asked from
	chatTurnPayload: TopicChatTurnPayload
}

/**
 * Streams the reply to an allowed private chat turn. The turn's largest cost is reserved against the user's budget
 * before any model call, and once the spend and open reservations reach the budget a turn is rejected as a spent budget
 * is.
 */
export async function answerChatTurn(
	context: Context,
	{ page, authorization, chatTurnPayload }: AnswerChatTurnOptions,
): Promise<Response> {
	// load what the question was asked from, if it names a podcast episode chapter or a Topic Post. one that is not on
	// this topic rejects the chat turn before any model call
	const { question, history, attachments, isSpoken } = chatTurnPayload
	const chatTurnSubject = await loadChatTurnSubject({ page, chatTurnPayload, userId: authorization.userId })
	if (!chatTurnSubject) {
		return context.json({ error: "not found" }, 404)
	}
	const { podcastEpisodeChapter, topicPost } = chatTurnSubject

	// read each attached file into its text, and reject the chat turn with why if a file cannot be read
	const resolvedChatAttachments = await resolveChatAttachments(attachments, authorization.userId)
	if (typeof resolvedChatAttachments === "string") {
		return toAttachmentRejectionResponse(context, resolvedChatAttachments)
	}

	// load the topic draft that the new-topic chat's tools read and write
	const { userId } = authorization
	const topicDraft = page.newTopic
		? await loadNewTopicChatDraft({
				userId,
				browserTopicDraft: chatTurnPayload.topicDraft,
				leaderTeams: authorization.leaderTeams,
			})
		: undefined

	// reserve the chat turn's largest cost from what it sends, and reject the turn once the spend and open reservations
	// reach the budget
	const messageChars = toChatTurnMessageChars({
		question,
		history,
		chatAttachments: resolvedChatAttachments.chatAttachments,
	})
	const maxDollars = maxChatTurnDollars({ messageChars, isPodcastReply: podcastEpisodeChapter !== undefined })
	const reservation = await reserveUserSpend({ userId, kind: "chatTurn", maxDollars })
	if (reservation === "rejected") {
		return rejectChatTurn(context, { authorization: { status: "budget", userId }, page })
	}

	// release the reservation if the reply never starts streaming. once it streams, the stream releases it
	const releaseOnFailure = toReleaseOnFailure(reservation)

	// the LiteLLM key that the chat turn bills, created first if the user has none
	const litellmApiKey = await loadOrProvisionUserLiteLLMKey(userId).catch(releaseOnFailure)

	// what the tools and the server record, and the request's analytics properties
	const toolCalls = toEmptyChatTurnToolCalls()
	const analyticsProperties = toAnalyticsProperties(context)

	// whether the user is an editor on this page's topic, which both the proposals and the preview tools follow
	const isTopicEditor = page.topicId !== undefined && authorization.canEditTopic

	// take the proposal this message answers, and apply it if the message agrees. only the new-topic chat and a topic
	// the user may edit hold proposals, and a question asked from the podcast player or from a Topic Post's page
	// answers none
	const isToolTurn = !podcastEpisodeChapter && !topicPost
	const isProposalPage = isToolTurn && (page.newTopic || isTopicEditor)
	const chatProposalResult = isProposalPage
		? await answerChatProposal({
				userId,
				page,
				question,
				history,
				topicDraft,
				toolCalls,
				analyticsProperties,
				litellmApiKey,
			}).catch(releaseOnFailure)
		: undefined

	// stream the reply from the page's own material: one topic, the team's held topics, or the topic draft. a podcast
	// player question takes no tools and ranks findings against its chapter title and its words, and a question asked
	// from a Topic Post's page takes no topic tool
	const chatReply = await streamChatReply({
		...(!isToolTurn
			? {}
			: toChatTurnTools({
					userId,
					page,
					isTopicEditor,
					toolCalls,
					analyticsProperties,
					topicDraft,
					leaderTeams: authorization.leaderTeams,
				})),
		podcastEpisodeChapter,
		topicPost,
		retrievalQuestion: podcastEpisodeChapter ? `${podcastEpisodeChapter.chapterTitle}\n${question}` : undefined,
		topicId: page.topicId,
		teamId: page.teamId,
		newTopic: page.newTopic,
		topicDraft,
		topicsRemaining: toPromptTopicsRemaining(authorization.topicsRemaining),
		leaderTeams: authorization.leaderTeams,
		question,
		history,
		chatAttachments: resolvedChatAttachments.chatAttachments,
		userId,
		isTopicOwner: authorization.isTopicOwner,
		isSpoken,
		litellmApiKey,
		serverToolCalls: chatProposalResult?.serverToolCalls,
		proposalOutcome: chatProposalResult?.proposalOutcome,
	}).catch(releaseOnFailure)
	if (!chatReply) {
		await reservation.release()
		return context.json({ error: "not found" }, 404)
	}

	// fetch the question's first link preview card in the background, never delaying the reply
	if (authorization.isPersisted) {
		void saveLinkPreviews(question).catch((error) => console.error("chat link preview failed", error))
	}

	// stream the reply to the user. the stored question names its attachments, and a withheld image is never stored
	return streamChatTurn(context, {
		chatReply,
		userId,
		page,
		question: withAttachmentNote(question, attachments),
		attachments: resolvedChatAttachments.storableAttachments,
		isPersisted: authorization.isPersisted,
		isSpoken,
		podcastEpisodeChapter,
		topicPostId: topicPost?.topicPostId,
		isTopicOwner: authorization.isTopicOwner,
		toolCalls,
		analyticsProperties,
		litellmApiKey,
		topicDraft,
		agreementTokens: chatProposalResult?.agreementTokens ?? 0,
		reservation,
	})
}

// what a topic chat turn was asked from: the podcast episode chapter that was playing, or the Topic Post whose page
// it was asked from. neither for a question asked from the chat
type ChatTurnSubject = { podcastEpisodeChapter?: PodcastEpisodeChapterContext; topicPost?: TopicPostChatContext }

// the page, the chat turn, and who asks
type LoadChatTurnSubjectOptions = { page: ChatPage; chatTurnPayload: TopicChatTurnPayload; userId: string }

// load what a chat turn was asked from. null for a chapter off the topic's published podcast episode, and for a Topic
// Post that is a draft, gone, or on another topic
async function loadChatTurnSubject({
	page,
	chatTurnPayload,
	userId,
}: LoadChatTurnSubjectOptions): Promise<ChatTurnSubject | null> {
	// only a topic's chat names either
	const { topicId } = page
	if (topicId === undefined) {
		return {}
	}

	// the chapter that was playing
	if (chatTurnPayload.podcastEpisodeChapter) {
		const podcastEpisodeChapter = await loadPodcastEpisodeChapterContext({
			topicId,
			...chatTurnPayload.podcastEpisodeChapter,
		})
		return podcastEpisodeChapter && { podcastEpisodeChapter }
	}

	// the post whose page the question came from
	if (chatTurnPayload.topicPostId) {
		const topicPost = await loadTopicPostChatContext({ topicId, topicPostId: chatTurnPayload.topicPostId, userId })
		return topicPost && { topicPost }
	}
	return {}
}

/**
 * Returns the response to a chat turn with a file it could not read, naming the rejection, with a retry time for a
 * busy one.
 */
export function toAttachmentRejectionResponse(context: Context, rejection: ChatAttachmentRejection): Response {
	const retryHeaders =
		rejection === "attachmentBusy" ? { "Retry-After": String(BUSY_ATTACHMENT_RETRY_AFTER_SECONDS) } : undefined
	return context.json(
		{ error: CHAT_ATTACHMENT_ERRORS[rejection] },
		ATTACHMENT_REJECTION_STATUSES[rejection],
		retryHeaders,
	)
}

// load the topic draft that a new-topic chat turn starts from: the stored draft over the browser's copy, with the
// browser's team if it names one the user leads, or else on the default team if it is public or invite
async function loadNewTopicChatDraft({
	userId,
	browserTopicDraft,
	leaderTeams = [],
}: {
	userId: string
	browserTopicDraft?: TopicDraft
	leaderTeams?: TopicDraftTeam[]
}): Promise<TopicDraft> {
	// the saved draft, and the team the browser names if the user leads it
	const storedTopicDraft = await loadTopicDraft(userId)
	const browserLeaderTeam = toLeaderTeam(browserTopicDraft?.team, leaderTeams)
	const topicDraft = storedTopicDraft
		? { ...storedTopicDraft, team: browserLeaderTeam ?? storedTopicDraft.team }
		: { ...(browserTopicDraft ?? EMPTY_TOPIC_DRAFT), team: browserLeaderTeam }
	return toTopicDraftOnDefaultTeam(topicDraft, leaderTeams[0] ?? null)
}

/**
 * Returns the led team a draft names, with its saved name, or null for a team the user does not lead. The name the
 * browser sends is never read.
 */
export function toLeaderTeam(
	team: TopicDraftTeam | null | undefined,
	leaderTeams: TopicDraftTeam[],
): TopicDraftTeam | null {
	return leaderTeams.find((leaderTeam) => leaderTeam.teamId === team?.teamId) ?? null
}

// the tools that a chat turn offers, in the fields that the reply reads them from
type ChatTurnTools = Pick<
	ChatTurnInput,
	| "tools"
	| "openNewTopicChatTool"
	| "proposeTopicEditTool"
	| "cancelTopicEditTool"
	| "suggestSourcesTool"
	| "proposeNewTopicTool"
>

// what one chat turn's tools are bound to
type ToChatTurnToolsOptions = {
	userId: string
	page: ChatPage
	isTopicEditor: boolean
	toolCalls: ChatTurnToolCalls
	analyticsProperties: AnalyticsProperties
	topicDraft?: TopicDraft
	// the teams the user leads, the default team first
	leaderTeams?: TopicDraftTeam[]
}

// pick a chat turn's tools: the draft tools for the new-topic chat, the preview tools for an editor on a topic,
// and the tool that opens the new-topic chat everywhere else
function toChatTurnTools({
	userId,
	page,
	isTopicEditor,
	toolCalls,
	analyticsProperties,
	topicDraft,
	leaderTeams = [],
}: ToChatTurnToolsOptions): ChatTurnTools {
	if (page.newTopic) {
		// copy the empty topic draft. the tools write into this object, and EMPTY_TOPIC_DRAFT is frozen
		const chatTurnTopicDraft = topicDraft ?? { ...EMPTY_TOPIC_DRAFT }
		const newTopicToolBinding = {
			userId,
			toolCalls,
			topicDraft: chatTurnTopicDraft,
			defaultTeam: leaderTeams[0] ?? null,
			analyticsProperties,
		}
		return {
			tools: toNewTopicChatTools(newTopicToolBinding),
			suggestSourcesTool: toSuggestTopicSourcesTool(newTopicToolBinding),
			proposeNewTopicTool: toProposeNewTopicTool(),
		}
	}

	// offer the tool that opens the new-topic chat on every other page
	const openNewTopicChatTool = toOpenNewTopicChatTool({ toolCalls })
	if (!isTopicEditor) {
		return { openNewTopicChatTool }
	}
	// add the tools that show a proposed change on the topic's card and take it back off for an editor on a topic
	return { openNewTopicChatTool, ...toTopicEditPreviewTools({ toolCalls }) }
}

// how many more topics the plan allows, as the prompt states it. an admin's unlimited marker becomes no limit at all
function toPromptTopicsRemaining(remainingTopics: number | undefined): number | undefined {
	return remainingTopics === undefined || remainingTopics >= ADMIN_QUOTA ? undefined : remainingTopics
}
