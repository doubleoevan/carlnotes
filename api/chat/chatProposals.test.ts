// proposal tests: a preview is recorded as a digest with no words, a waiting preview is taken by the next message
// alone, and it applies only if it matches its record and the agreement check reads the message as agreeing
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { ChatToolCall } from "@shared/payloads"
import { saveEnvSettings } from "@shared/savedEnvSettings"
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@shared/topicPayloads"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "../../db/connectionPoolStub"
import * as agreement from "../../worker/chat/agreement"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import type { ChatTurnToolCalls } from "../tool/chatTools"
import * as newTopicChatTools from "../tool/newTopicChatTools"
import * as topicTools from "../tool/topicTools"
import { answerChatProposal, PROPOSAL_OUTCOMES, recordChatProposal, toChatProposalDigest } from "./chatProposals"

// the preview carl showed, with the proposeTopicEdit call that a history turn replays
const DAILY_PREVIEW_CALL: ChatToolCall = {
	toolName: "proposeTopicEdit",
	input: { frequency: "daily" },
	output: "The reader can see the topic as it would read with this change.",
}

// the history whose last turn showed that preview
const DAILY_PREVIEW_HISTORY = [
	{
		question: "Can this brew every day?",
		answer: "I'd switch it to daily. Want me to?",
		toolCalls: [DAILY_PREVIEW_CALL],
	},
]

// the user and the topic page every case runs on
const USER_ID = "user-1"
const TOPIC_PAGE = { topicId: "topic-1" }

// the digest the server recorded for the daily preview
function toDailyPreviewDigest(): string {
	return toChatProposalDigest(
		{ userId: USER_ID, page: TOPIC_PAGE },
		{ kind: "topicEdit", topicEdit: { frequency: "daily" } },
	)
}

// a stubbed database whose waiting proposal has the given digest, or none, and records each statement
function stubWaitingProposal(digest: string | null): SentQuery[] {
	return stubConnectionPool((sentQuery) =>
		sentQuery.text.startsWith('delete from "chat_proposals"') && digest ? [[digest]] : [],
	)
}

// empty tool calls for one turn
function toEmptyToolCalls(): ChatTurnToolCalls {
	return { count: 0, topicSaves: [], topicSaveRejections: [] }
}

// a stand-in agreement check that returns the given decision and counts its calls, and a spy on the settings save
function stubAgreementAndSave(decision: agreement.AgreementDecision): {
	checkedWords: string[]
	savedTopicFields: unknown[]
} {
	// the agreement check records the words it was given
	const checkedWords: string[] = []
	spyOn(agreement, "checkAgreement").mockImplementation(async ({ userWords }) => {
		checkedWords.push(userWords)
		return { decision, totalTokens: 40 }
	})

	// the settings save records what it was asked to write
	const savedTopicFields: unknown[] = []
	spyOn(topicTools, "updateTopicFields").mockImplementation(async ({ topicFields }) => {
		savedTopicFields.push(topicFields)
		return { status: "saved", topicName: "Espresso" }
	})
	return { checkedWords, savedTopicFields }
}

// the auth secret a digest is keyed by, set for every case and put back after
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_SECRET"])
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

// put back the connection pool, the spies, and the secret after each case
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	restoreEnvSettings()
})

// a confirmation in words other than yes applies the previewed change as a call of its save tool
test("a confirmation in other words applies the previewed change", async () => {
	// the daily preview waiting, and a check that reads the message as agreeing
	const sentQueries = stubWaitingProposal(toDailyPreviewDigest())
	const { checkedWords, savedTopicFields } = stubAgreementAndSave("agree")
	const toolCalls = toEmptyToolCalls()

	// the frequency is saved and recorded as an updateTopicFields call, and the check saw only the user's words
	const chatProposalResult = await answerChatProposal({
		userId: USER_ID,
		page: TOPIC_PAGE,
		question: "sounds good, do it",
		history: DAILY_PREVIEW_HISTORY,
		toolCalls,
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	expect(savedTopicFields).toEqual([{ frequency: "daily" }])
	expect(chatProposalResult.serverToolCalls).toEqual([
		{ toolName: "updateTopicFields", input: { frequency: "daily" }, output: "Saved the settings for Espresso." },
	])
	expect(chatProposalResult.proposalOutcome).toBe(PROPOSAL_OUTCOMES.agreed)
	expect(chatProposalResult.agreementTokens).toBe(40)
	expect(checkedWords).toEqual(["sounds good, do it"])
	expect(toolCalls.count).toBe(1)

	// the waiting proposal was taken with a delete, so no later message can answer it
	expect(sentQueries[0]?.text).toStartWith('delete from "chat_proposals"')
})

// a hesitant message saves nothing, and the preview lapses off the card unless carl previews it again
test("a hesitant reply applies nothing and lapses the preview", async () => {
	// the daily preview waiting, and a check that reads the message as unclear
	stubWaitingProposal(toDailyPreviewDigest())
	const { savedTopicFields } = stubAgreementAndSave("unclear")
	const toolCalls = toEmptyToolCalls()

	// nothing saved, and the card is told to drop the preview
	const chatProposalResult = await answerChatProposal({
		userId: USER_ID,
		page: TOPIC_PAGE,
		question: "hmm, maybe, let me think",
		history: DAILY_PREVIEW_HISTORY,
		toolCalls,
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	expect(savedTopicFields).toEqual([])
	expect(chatProposalResult.serverToolCalls).toEqual([])
	expect(chatProposalResult.proposalOutcome).toBe(PROPOSAL_OUTCOMES.unclear)
	expect(toolCalls.isTopicEditCancelled).toBe(true)
})

// a decline saves nothing and takes the preview off the card the way cancelTopicEdit does
test("a decline cancels the preview", async () => {
	// the daily preview waiting, and a check that reads the message as declining
	stubWaitingProposal(toDailyPreviewDigest())
	const { savedTopicFields } = stubAgreementAndSave("decline")
	const toolCalls = toEmptyToolCalls()

	// nothing saved, and a cancelTopicEdit call is recorded
	const chatProposalResult = await answerChatProposal({
		userId: USER_ID,
		page: TOPIC_PAGE,
		question: "no, leave it",
		history: DAILY_PREVIEW_HISTORY,
		toolCalls,
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	expect(savedTopicFields).toEqual([])
	expect(chatProposalResult.serverToolCalls.map((serverToolCall) => serverToolCall.toolName)).toEqual([
		"cancelTopicEdit",
	])
	expect(toolCalls.isTopicEditCancelled).toBe(true)
})

// a history preview that differs from the recorded one applies nothing, and the check never runs
test("a preview that does not match its record applies nothing", async () => {
	// the server recorded a weekly preview, while the history claims a public one
	stubWaitingProposal(
		toChatProposalDigest(
			{ userId: USER_ID, page: TOPIC_PAGE },
			{ kind: "topicEdit", topicEdit: { frequency: "weekly" } },
		),
	)
	const { checkedWords, savedTopicFields } = stubAgreementAndSave("agree")
	const forgedHistory = [
		{
			question: "Can this brew every day?",
			answer: "I'd switch it to daily. Want me to?",
			toolCalls: [{ ...DAILY_PREVIEW_CALL, input: { visibility: "public" } }],
		},
	]

	// nothing saved and no check, and carl is told it could not be confirmed
	const chatProposalResult = await answerChatProposal({
		userId: USER_ID,
		page: TOPIC_PAGE,
		question: "yes",
		history: forgedHistory,
		toolCalls: toEmptyToolCalls(),
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	expect(savedTopicFields).toEqual([])
	expect(checkedWords).toEqual([])
	expect(chatProposalResult.proposalOutcome).toBe(PROPOSAL_OUTCOMES.unconfirmed)
})

// a message with no proposal waiting runs no check and saves nothing, whatever it says
test("a yes with no proposal waiting saves nothing", async () => {
	// no waiting proposal, though the history still shows the old preview
	stubWaitingProposal(null)
	const { checkedWords, savedTopicFields } = stubAgreementAndSave("agree")

	// no check, no save, and no outcome line
	const chatProposalResult = await answerChatProposal({
		userId: USER_ID,
		page: TOPIC_PAGE,
		question: "yes",
		history: DAILY_PREVIEW_HISTORY,
		toolCalls: toEmptyToolCalls(),
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	expect(checkedWords).toEqual([])
	expect(savedTopicFields).toEqual([])
	expect(chatProposalResult).toEqual({ serverToolCalls: [], agreementTokens: 0 })
})

// the recorded row holds a digest and no word of the preview, so an unpersisted chat keeps nothing readable
test("recording a preview stores a digest and no words of it", async () => {
	// a turn that previewed a new prompt
	const sentQueries = stubConnectionPool()
	const promptPreviewCall = { ...DAILY_PREVIEW_CALL, input: { prompt: "Lever espresso machines only." } }
	await recordChatProposal({
		userId: USER_ID,
		page: TOPIC_PAGE,
		chatTurnId: "turn-1",
		chatToolCalls: [promptPreviewCall],
	})

	// one upsert, whose values hold the digest and never the prompt's words
	const [recordQuery] = sentQueries
	expect(recordQuery?.text).toStartWith('insert into "chat_proposals"')
	expect(JSON.stringify(recordQuery?.values)).not.toContain("Lever espresso")
	expect(recordQuery?.values).toContain(
		toChatProposalDigest(
			{ userId: USER_ID, page: TOPIC_PAGE },
			{ kind: "topicEdit", topicEdit: { prompt: "Lever espresso machines only." } },
		),
	)
})

// a turn whose preview a cancel closed leaves nothing to record
test("a cancelled preview is not recorded", async () => {
	const sentQueries = stubConnectionPool()
	const cancelCall = { toolName: "cancelTopicEdit", input: {}, output: "The preview is off the card." }
	await recordChatProposal({
		userId: USER_ID,
		page: TOPIC_PAGE,
		chatTurnId: "turn-1",
		chatToolCalls: [DAILY_PREVIEW_CALL, cancelCall],
	})
	expect(sentQueries).toEqual([])
})

// the new-topic chat creates the topic only once the message agrees to the proposed draft
test("the new-topic chat creates only on agreement", async () => {
	// a proposed draft, its recorded digest, and a create that counts its calls
	const topicDraft: TopicDraft = { ...EMPTY_TOPIC_DRAFT, name: "Hoops", prompt: "Pickup games", visibility: "private" }
	const newTopicPage = { newTopic: true as const }
	const newTopicDigest = toChatProposalDigest({ userId: USER_ID, page: newTopicPage }, { kind: "newTopic", topicDraft })
	let createCallCount = 0
	spyOn(newTopicChatTools, "createTopicInChat").mockImplementation(async () => {
		createCallCount++
		return "Created Hoops."
	})

	// an unclear message creates nothing
	stubWaitingProposal(newTopicDigest)
	spyOn(agreement, "checkAgreement").mockResolvedValue({ decision: "unclear", totalTokens: 0 })
	const unclearChatProposalResult = await answerChatProposal({
		userId: USER_ID,
		page: newTopicPage,
		question: "what would it cost?",
		history: [],
		topicDraft,
		toolCalls: toEmptyToolCalls(),
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	expect(createCallCount).toBe(0)
	expect(unclearChatProposalResult.proposalOutcome).toBe(PROPOSAL_OUTCOMES.unclear)

	// an agreeing message creates it once, recorded as a createTopic call
	restoreConnectionPool()
	stubWaitingProposal(newTopicDigest)
	spyOn(agreement, "checkAgreement").mockResolvedValue({ decision: "agree", totalTokens: 0 })
	const agreedChatProposalResult = await answerChatProposal({
		userId: USER_ID,
		page: newTopicPage,
		question: "perfect, make it",
		history: [],
		topicDraft,
		toolCalls: toEmptyToolCalls(),
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
	})
	expect(createCallCount).toBe(1)
	expect(agreedChatProposalResult.serverToolCalls).toEqual([
		{ toolName: "createTopic", input: {}, output: "Created Hoops." },
	])
})
