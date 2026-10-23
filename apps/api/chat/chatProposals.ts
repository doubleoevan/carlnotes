// the chat's proposals: the change carl previewed in a chat turn, recorded with that chat turn, taken back at the
// user's next message on that page, and applied by the server only if that message agrees to it. a private chat
// records a keyed digest
import { CANCEL_TOPIC_EDIT_TOOL, PROPOSE_NEW_TOPIC_TOOL, toStandingTopicEditCall } from "@carlnotes/contracts/chat"
import type { ChatToolCall, ChatTurnPayload } from "@carlnotes/contracts/payloads"
import {
	type ProposeTopicEditPayload,
	proposeTopicEditPayload,
	type TopicDraft,
	topicDraftPayload,
} from "@carlnotes/contracts/topicPayloads"
import { db } from "@carlnotes/db"
import { chatProposals } from "@carlnotes/db/schema/chat"
import { checkAgreement } from "@carlnotes/pipeline/chat/agreement"
import { isSameSignature, toAuthSecretSignature } from "@carlnotes/server/hmac"
import { and, eq, isNull, type SQL } from "drizzle-orm"
import { toCanonicalJson } from "../canonicalJson"
import type { AnalyticsProperties } from "../currentUser"
import { type ChatTurnToolCalls, TOPIC_EDIT_CANCELLED_TEXT } from "../tool/chatTools"
import { createTopicInChat, toTopicDraftSummary } from "../tool/newTopicChatTools"
import { applyTopicEdit } from "../tool/topicEditSaves"
import type { ChatPage } from "./chatTurns"

// what carl previewed: an edit to the page's topic, or the topic draft that the new-topic chat would create
export type ChatProposal =
	| { kind: "topicEdit"; topicEdit: ProposeTopicEditPayload }
	| { kind: "newTopic"; topicDraft: TopicDraft }

// what carl reads about the proposal this message answered, one line for each way it can end
export const PROPOSAL_OUTCOMES = {
	agreed:
		"The reader agreed, and the app applied your preview. Each save is in this turn's tool calls. Tell the reader what was saved. Nothing is left to preview or cancel.",
	declined: "The reader turned your last preview down, so nothing was saved and the preview is off the card.",
	unclear:
		"The reader's message did not clearly agree to your last preview, so nothing was saved and the preview lapsed. If the change still stands, ask plainly and preview it again.",
	unconfirmed:
		"Your last preview could not be confirmed against the one the app recorded, so nothing was saved. If the change still stands, preview it again and ask.",
} as const

// what the server did with the proposal a message answered: the calls it made, the line carl reads, and the tokens
// the agreement check spent. a result with no outcome means no proposal was waiting
export type ChatProposalResult = { serverToolCalls: ChatToolCall[]; proposalOutcome?: string; agreementTokens: number }

// the result if no proposal was waiting: no calls, no outcome, and no agreement tokens
export const NO_PROPOSAL_RESULT: ChatProposalResult = { serverToolCalls: [], agreementTokens: 0 }

/**
 * Takes an unconfirmed proposal's preview off the card and returns the unconfirmed result.
 */
export function cancelUnconfirmedProposal(toolCalls: ChatTurnToolCalls, page: ChatPage): ChatProposalResult {
	cancelProposalPreview(toolCalls, page)
	return { serverToolCalls: [], proposalOutcome: PROPOSAL_OUTCOMES.unconfirmed, agreementTokens: 0 }
}

// take a topic edit's preview off the card. the new-topic chat's draft card has no preview to take off
function cancelProposalPreview(toolCalls: ChatTurnToolCalls, page: ChatPage): void {
	toolCalls.isTopicEditCancelled = !page.newTopic
}

// the unique key a proposal row is upserted on: the user, the topic, and the team
export const CHAT_PROPOSAL_PAGE_TARGET = [chatProposals.userId, chatProposals.topicId, chatProposals.teamId]

// the user, topic, and team a proposal row is stored under. a null topic or team matches only a null column
type ChatProposalPageKey = { userId: string; topicId: string | null; teamId: string | null }

/**
 * Returns the filter for the one proposal row stored under a page key.
 */
export function toChatProposalPageFilter({ userId, topicId, teamId }: ChatProposalPageKey): SQL | undefined {
	return and(
		eq(chatProposals.userId, userId),
		topicId === null ? isNull(chatProposals.topicId) : eq(chatProposals.topicId, topicId),
		teamId === null ? isNull(chatProposals.teamId) : eq(chatProposals.teamId, teamId),
	)
}

// the user and the page a proposal belongs to
type ChatProposalRef = { userId: string; page: ChatPage }

// the turn whose standing proposal is recorded: its row, its tool calls, and the draft it left in the new-topic chat
type RecordChatProposalOptions = ChatProposalRef & {
	chatTurnId: string
	chatToolCalls: ChatToolCall[]
	topicDraft?: TopicDraft
}

/**
 * Records the proposal a finished turn leaves standing as a keyed digest, one per user per page. A turn that leaves
 * none records nothing, so the row taken at the start of the turn stays gone.
 */
export async function recordChatProposal({
	userId,
	page,
	chatTurnId,
	chatToolCalls,
	topicDraft,
}: RecordChatProposalOptions): Promise<void> {
	// find the proposal the turn leaves standing, and record nothing if none stands
	const chatProposal = toStandingChatProposal({ page, chatToolCalls, topicDraft })
	if (!chatProposal) {
		return
	}

	// one row per user per page, replaced by the newest proposal
	const digest = toChatProposalDigest({ userId, page }, chatProposal)
	await db
		.insert(chatProposals)
		.values({ userId, topicId: page.topicId ?? null, chatTurnId, digest })
		.onConflictDoUpdate({
			target: CHAT_PROPOSAL_PAGE_TARGET,
			set: { chatTurnId, digest, createdAt: new Date() },
		})
}

// the turn whose message may answer a proposal, and what the save and create paths take
type AnswerChatProposalOptions = ChatProposalRef & {
	question: string
	history: ChatTurnPayload["history"]
	topicDraft?: TopicDraft
	toolCalls: ChatTurnToolCalls
	analyticsProperties: AnalyticsProperties
	litellmApiKey?: string
}

/**
 * Takes the proposal waiting on this page, so only the next message can answer it, and applies it if the message
 * agrees. The proposal is rebuilt from the history in a topic chat and from the stored draft in the new-topic chat,
 * and nothing applies unless it matches the recorded digest. Only the user's own words reach the agreement check.
 */
export async function answerChatProposal(
	answerChatProposalOptions: AnswerChatProposalOptions,
): Promise<ChatProposalResult> {
	// take the waiting proposal, and stop if none was waiting
	const { userId, page, question, history, topicDraft, toolCalls, litellmApiKey } = answerChatProposalOptions
	const recordedDigest = await takeChatProposalDigest({ userId, page })
	if (!recordedDigest) {
		return NO_PROPOSAL_RESULT
	}

	// rebuild the proposal from what the browser sent, and apply nothing unless it matches what was recorded
	const chatProposal = page.newTopic
		? toNewTopicChatProposal(topicDraft)
		: toStandingChatProposal({ page, chatToolCalls: history.at(-1)?.toolCalls ?? [] })
	const rebuiltDigest = chatProposal ? toChatProposalDigest({ userId, page }, chatProposal) : ""
	if (!chatProposal || !isSameSignature({ expectedSignature: recordedDigest, signature: rebuiltDigest })) {
		return cancelUnconfirmedProposal(toolCalls, page)
	}

	// read only the user's words against the proposal, then act on the decision
	return resolveChatProposal({
		page,
		chatProposal,
		question,
		toolCalls,
		litellmApiKey,
		applyProposal: (agreedChatProposal) => applyChatProposal(answerChatProposalOptions, agreedChatProposal),
	})
}

// a matched proposal, the message that answers it, the turn's tool call record, the key the check bills, and how an
// agreed proposal is applied
export type ResolveChatProposalOptions = {
	page: ChatPage
	chatProposal: ChatProposal
	question: string
	toolCalls: ChatTurnToolCalls
	litellmApiKey?: string
	applyProposal: (chatProposal: ChatProposal) => Promise<ChatToolCall[]>
}

/**
 * Runs the agreement check over the user's words alone, then applies an agreed proposal, cancels a declined one, or
 * lets an unclear one lapse, returning the calls made and the line carl reads.
 */
export async function resolveChatProposal({
	page,
	chatProposal,
	question,
	toolCalls,
	litellmApiKey,
	applyProposal,
}: ResolveChatProposalOptions): Promise<ChatProposalResult> {
	const { decision, totalTokens: agreementTokens } = await checkAgreement({
		userWords: question,
		proposal: toChatProposalText(chatProposal),
		litellmApiKey,
	})

	// apply an agreed proposal through the same paths a save tool takes
	if (decision === "agree") {
		const serverToolCalls = await applyProposal(chatProposal)
		return { serverToolCalls, proposalOutcome: PROPOSAL_OUTCOMES.agreed, agreementTokens }
	}

	// a decline or an unclear message takes the preview off the card. carl previewing again in this turn puts it back
	cancelProposalPreview(toolCalls, page)

	// a decline records the cancel that cancelTopicEdit makes
	if (decision === "decline") {
		const serverToolCalls = page.newTopic
			? []
			: [{ toolName: CANCEL_TOPIC_EDIT_TOOL, input: {}, output: TOPIC_EDIT_CANCELLED_TEXT }]
		return { serverToolCalls, proposalOutcome: PROPOSAL_OUTCOMES.declined, agreementTokens }
	}

	// an unclear message lets the preview lapse
	return { serverToolCalls: [], proposalOutcome: PROPOSAL_OUTCOMES.unclear, agreementTokens }
}

/**
 * Returns the proposal a set of tool calls leaves standing: the last preview of a topic edit that no save or cancel closed,
 * or, in the new-topic chat, the draft once proposeNewTopic was called. Null if nothing stands.
 */
export function toStandingChatProposal({
	page,
	chatToolCalls,
	topicDraft,
}: {
	page: ChatPage
	chatToolCalls: ChatToolCall[]
	topicDraft?: TopicDraft
}): ChatProposal | null {
	// the new-topic chat proposes the draft the turn left
	if (page.newTopic) {
		const isNewTopicProposed = chatToolCalls.some((chatToolCall) => chatToolCall.toolName === PROPOSE_NEW_TOPIC_TOOL)
		return isNewTopicProposed ? toNewTopicChatProposal(topicDraft) : null
	}

	// a topic chat proposes the last preview still standing, read by its own schema
	const standingTopicEditCall = toStandingTopicEditCall(chatToolCalls)
	const topicEditResult = proposeTopicEditPayload.safeParse(standingTopicEditCall?.input)
	return standingTopicEditCall && topicEditResult.success
		? { kind: "topicEdit", topicEdit: topicEditResult.data }
		: null
}

/**
 * Returns the keyed digest of a proposal for one user and page, over its canonical json, so the same proposal always matches
 * and no browser can make one the server did not record.
 */
export function toChatProposalDigest({ userId, page }: ChatProposalRef, chatProposal: ChatProposal): string {
	return toAuthSecretSignature({
		value: toCanonicalJson({ userId, topicId: page.topicId ?? null, chatProposal }),
		purpose: "chat proposals",
		encoding: "base64url",
	})
}

/**
 * Returns a proposal as labeled lines, for the agreement check to read what the user's message answers.
 */
export function toChatProposalText(chatProposal: ChatProposal): string {
	// the new-topic chat's draft reads the way carl reads it back
	if (chatProposal.kind === "newTopic") {
		return `Create a new topic from this draft: ${toTopicDraftSummary(chatProposal.topicDraft)}`
	}

	// one line per field, with a source to add or remove on its own line
	const { addSources = [], removeSourceIds = [], ...topicFields } = chatProposal.topicEdit
	return [
		"Change the topic as follows.",
		...Object.entries(topicFields)
			.filter(([, value]) => value !== undefined)
			.map(([fieldName, value]) => `${fieldName}: ${Array.isArray(value) ? value.join(", ") : String(value)}`),
		...addSources.map((topicSource) => `add source: ${topicSource.sourceOption} ${topicSource.value}`.trim()),
		...removeSourceIds.map((sourceId) => `remove source: ${sourceId}`),
	].join("\n")
}

// take this page's waiting proposal and delete it, returning its digest, or null if none was waiting
async function takeChatProposalDigest({ userId, page }: ChatProposalRef): Promise<string | null> {
	const [takenChatProposal] = await db
		.delete(chatProposals)
		.where(toChatProposalPageFilter({ userId, topicId: page.topicId ?? null, teamId: null }))
		.returning({ digest: chatProposals.digest })
	return takenChatProposal?.digest ?? null
}

// the new-topic proposal for a draft read by its own schema, or null for a draft that is not there
function toNewTopicChatProposal(topicDraft?: TopicDraft): ChatProposal | null {
	const topicDraftResult = topicDraftPayload.safeParse(topicDraft)
	return topicDraftResult.success ? { kind: "newTopic", topicDraft: topicDraftResult.data } : null
}

// apply an agreed proposal, and return each save as a call of the tool it went through
async function applyChatProposal(
	{ userId, page, toolCalls, analyticsProperties }: AnswerChatProposalOptions,
	chatProposal: ChatProposal,
): Promise<ChatToolCall[]> {
	// the new-topic chat creates the topic from the agreed draft
	if (chatProposal.kind === "newTopic") {
		const createTopicText = await createTopicInChat({
			userId,
			toolCalls,
			topicDraft: chatProposal.topicDraft,
			analyticsProperties,
		})
		return [{ toolName: "createTopic", input: {}, output: createTopicText }]
	}

	// apply the topic edit's saves
	return applyTopicEdit(
		{ userId, topicId: page.topicId ?? "", origin: "chat", toolCalls, analyticsProperties },
		chatProposal.topicEdit,
	)
}
