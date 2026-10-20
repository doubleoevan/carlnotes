// a topic's team chat room proposals: a preview is stored for the member it was shown to, and only that member's own
// words can agree to it
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toWordsWithoutModelMention } from "@shared/chatMentions"
import { restoreConnectionPool, stubConnectionPool } from "../../db/connectionPoolStub"
import * as agreement from "../../worker/chat/agreement"
import * as chatTools from "../tool/chatTools"
import { toEmptyChatTurnToolCalls } from "../tool/chatTools"
import { decryptChatJson, decryptChatText, encryptChatJson } from "./encryption"
import { answerChatRoomProposal, recordChatRoomProposal } from "./roomProposals"

// the connection pool's own query, put back after each test along with the spies
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a chat room turn's standing preview is stored encrypted under the member, the topic, and the team
test("a chat room turn's standing preview is stored encrypted for the member it was shown to", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await recordChatRoomProposal({
		userId: "maya",
		topicId: "topic-1",
		teamId: "team-1",
		chatTurnId: "turn-1",
		chatToolCalls: [{ toolName: "proposeTopicEdit", input: { frequency: "daily" }, output: "previewed" }],
	})
	expect(sentQueries[0]?.text).toStartWith('insert into "chat_proposals"')
	const storedProposal = sentQueries[0]?.values.find(
		(value) => typeof value === "string" && decryptChatText(value)?.includes("daily"),
	)
	expect(decryptChatJson(storedProposal as string)).toEqual({ frequency: "daily" })
	expect(sentQueries[0]?.values).toEqual(expect.arrayContaining(["maya", "topic-1", "team-1", "turn-1"]))
})

// the member it was shown to says yes, and the preview is applied under that member's rights
test("the member a chat room preview was shown to agrees, and the edit is applied for them", async () => {
	// the member's stored preview, taken back by the delete
	const sentQueries = stubConnectionPool(() => [[encryptChatJson({ frequency: "daily" })]])
	const checkAgreementSpy = spyOn(agreement, "checkAgreement").mockResolvedValue({ decision: "agree", totalTokens: 9 })
	const updateTopicFieldsInChatSpy = spyOn(chatTools, "updateTopicFieldsInChat").mockResolvedValue("Saved.")
	const toolCalls = toEmptyChatTurnToolCalls()
	const chatProposalResult = await answerChatRoomProposal({
		userId: "maya",
		topicId: "topic-1",
		teamId: "team-1",
		question: "@carl yes, do it",
		toolCalls,
	})

	// the delete names this member's row in this team's chat room alone, and the check reads this member's words without
	// the mention
	expect(sentQueries[0]?.text).toStartWith('delete from "chat_proposals"')
	expect(sentQueries[0]?.values).toEqual(["maya", "topic-1", "team-1"])
	expect(checkAgreementSpy.mock.calls[0]?.[0].userWords).toBe("yes, do it")
	expect(updateTopicFieldsInChatSpy).toHaveBeenCalledWith(
		expect.objectContaining({ userId: "maya", topicId: "topic-1" }),
		{ frequency: "daily" },
	)
	expect(chatProposalResult.agreementTokens).toBe(9)
	expect(chatProposalResult.serverToolCalls.map((serverToolCall) => serverToolCall.toolName)).toEqual([
		"updateTopicFields",
	])
})

// another member's yes finds no preview of their own, so nothing is checked or saved, and the first member's row is
// never touched
test("another member's yes answers no preview and saves nothing", async () => {
	const sentQueries = stubConnectionPool(() => [])
	const checkAgreementSpy = spyOn(agreement, "checkAgreement")
	const updateTopicFieldsInChatSpy = spyOn(chatTools, "updateTopicFieldsInChat")
	const chatProposalResult = await answerChatRoomProposal({
		userId: "devon",
		topicId: "topic-1",
		teamId: "team-1",
		question: "@carl yes, save it",
		toolCalls: toEmptyChatTurnToolCalls(),
	})
	expect(sentQueries[0]?.values).toEqual(["devon", "topic-1", "team-1"])
	expect(checkAgreementSpy).not.toHaveBeenCalled()
	expect(updateTopicFieldsInChatSpy).not.toHaveBeenCalled()
	expect(chatProposalResult).toEqual({ serverToolCalls: [], agreementTokens: 0 })
})

// a carl mention is dropped from a chat room message's words, and an email address, a longer username like carl-bot, or
// another word is kept
test("toWordsWithoutModelMention drops the carl mention and nothing else", () => {
	expect(toWordsWithoutModelMention("@carl yes, do it")).toBe("yes, do it")
	expect(toWordsWithoutModelMention("yes @Carl please")).toBe("yes please")
	expect(toWordsWithoutModelMention("mail me at maya@carl.dev")).toBe("mail me at maya@carl.dev")
	expect(toWordsWithoutModelMention("@carl-bot yes")).toBe("@carl-bot yes")
})
