// answering an allowed chat turn on any private chat page: the podcast episode chapter it may name, its attachments,
// the proposal it may answer, its tools, and the streamed reply
import { CHAT_ATTACHMENT_ERRORS, type ChatAttachmentRejection } from "@carlnotes/contracts/chat"
import { withAttachmentNote } from "@carlnotes/contracts/chatQuestionNotes"
import type { TopicChatTurnPayload } from "@carlnotes/contracts/payloads"
import { ADMIN_QUOTA } from "@carlnotes/contracts/plans"
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { reserveUserSpend, toReleaseOnFailure } from "@carlnotes/models/spendReservations"
import type { ChatTurnInput } from "@carlnotes/pipeline/chat/chatMessages"
import { maxChatTurnDollars, toChatTurnMessageChars } from "@carlnotes/pipeline/chat/chatTurnCost"
import { streamChatReply } from "@carlnotes/pipeline/chat/index"
import { loadPodcastEpisodeChapterContext } from "@carlnotes/pipeline/chat/retrievePodcastEpisodeChapter"
import type { Context } from "hono"
import { type AnalyticsProperties, toAnalyticsProperties } from "../currentUser"
import {
	type ChatTurnToolCalls,
	toEmptyChatTurnToolCalls,
	toOpenNewTopicChatTool,
	toTopicEditPreviewTools,
} from "../tool/chatTools"
import { toNewTopicChatTools, toProposeNewTopicTool, toSuggestTopicSourcesTool } from "../tool/newTopicChatTools"
import { loadTopicDraft } from "../topic/topicDrafts"
import { resolveChatAttachments } from "./chatAttachmentParts"
import { answerChatProposal } from "./chatProposals"
import { type ChatTurnAuthorization, rejectChatTurn } from "./chatTurnAuthorization"
import { streamChatTurn } from "./chatTurnStream"
import type { ChatPage } from "./chatTurns"
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
	// load the podcast episode chapter that a podcast player question names. a chapter off this topic's published podcast
	// episode rejects the chat turn before any model call
	const { question, history, attachments, isSpoken } = chatTurnPayload
	const podcastEpisodeChapter =
		page.topicId !== undefined && chatTurnPayload.podcastEpisodeChapter
			? await loadPodcastEpisodeChapterContext({ topicId: page.topicId, ...chatTurnPayload.podcastEpisodeChapter })
			: undefined
	if (podcastEpisodeChapter === null) {
		return context.json({ error: "not found" }, 404)
	}

	// read each attached file into its text, and reject the chat turn with why if a file cannot be read
	const resolvedChatAttachments = await resolveChatAttachments(attachments)
	if (typeof resolvedChatAttachments === "string") {
		return toAttachmentRejectionResponse(context, resolvedChatAttachments)
	}

	// load the topic draft that the new-topic chat's tools read and write
	const { userId } = authorization
	const topicDraft = page.newTopic ? await loadNewTopicChatDraft(userId, chatTurnPayload.topicDraft) : undefined

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
	// the user may edit hold proposals, and a question asked from the podcast player answers none
	const isProposalPage = !podcastEpisodeChapter && (page.newTopic || isTopicEditor)
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
	// player question takes no tools and ranks findings against its chapter title and its words
	const chatReply = await streamChatReply({
		...(podcastEpisodeChapter
			? {}
			: toChatTurnTools({
					userId,
					page,
					isTopicEditor,
					toolCalls,
					analyticsProperties,
					topicDraft,
				})),
		podcastEpisodeChapter,
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
		toolCalls,
		analyticsProperties,
		litellmApiKey,
		topicDraft,
		agreementTokens: chatProposalResult?.agreementTokens ?? 0,
		reservation,
	})
}

// the response to a chat turn with a file it could not read, naming the rejection, with a retry time for a busy one
function toAttachmentRejectionResponse(context: Context, rejection: ChatAttachmentRejection): Response {
	const retryHeaders =
		rejection === "attachmentBusy" ? { "Retry-After": String(BUSY_ATTACHMENT_RETRY_AFTER_SECONDS) } : undefined
	return context.json(
		{ error: CHAT_ATTACHMENT_ERRORS[rejection] },
		ATTACHMENT_REJECTION_STATUSES[rejection],
		retryHeaders,
	)
}

// load the topic draft that a new-topic chat turn starts from: the stored draft over the browser's copy, with the
// browser's team if it sends one
async function loadNewTopicChatDraft(userId: string, browserTopicDraft?: TopicDraft): Promise<TopicDraft | undefined> {
	const storedTopicDraft = await loadTopicDraft(userId)
	if (!storedTopicDraft) {
		return browserTopicDraft
	}
	return { ...storedTopicDraft, team: browserTopicDraft?.team ?? storedTopicDraft.team }
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
}: ToChatTurnToolsOptions): ChatTurnTools {
	if (page.newTopic) {
		// copy the empty topic draft. the tools write into this object, and EMPTY_TOPIC_DRAFT is frozen
		const chatTurnTopicDraft = topicDraft ?? { ...EMPTY_TOPIC_DRAFT }
		const newTopicToolBinding = { userId, toolCalls, topicDraft: chatTurnTopicDraft, analyticsProperties }
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
