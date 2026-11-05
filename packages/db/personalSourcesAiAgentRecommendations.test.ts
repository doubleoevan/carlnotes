import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { ConnectedAiAgent } from "@carlnotes/contracts/personalSourcesAccounts"
import { encryptPrivateText } from "@carlnotes/server/privateText"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import * as connections from "./aiAgentConnections"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import {
	loadPersonalSourcesAiAgentRecommendations,
	matchesPersonalSourcesTopicDescription,
} from "./personalSourcesAiAgentRecommendations"
import { topics } from "./schema/topics"

// one verified app can have several concrete OAuth registrations
const aiAgent: ConnectedAiAgent = {
	id: "domain:claude.ai",
	label: "Claude",
	domain: "claude.ai",
	clientIds: ["first", "second"],
	isConnected: true,
	consentCreatedAt: "2026-11-02T00:00:00.000Z",
}
const restoreEnvSettings = saveEnvSettings(["CHAT_TEXT_KEY"])
const description = "Local language models"
let topicOwnerId = "owner"

beforeEach(() => {
	// use test-only ciphertext and live registration metadata
	Bun.env.CHAT_TEXT_KEY = Buffer.alloc(32, 7).toString("base64")
	topicOwnerId = "owner"
	spyOn(connections, "loadConnectedAiAgents").mockResolvedValue([aiAgent])
})

afterEach(() => {
	// retire keys, private fixtures, and database spies between checks
	mock.restore()
	restoreConnectionPool()
	restoreEnvSettings()
})

test("suggestions require three accepted matching sends across the app's registrations", async () => {
	// two matches and a near miss cannot qualify a connected app
	const entries = [toEntry("3", "Local language models"), toEntry("2", "Language models on laptops", "second")]
	const queries = stubHistory([...entries, toEntry("1", "A local coffee roaster")])
	expect(await loadPersonalSourcesAiAgentRecommendations({ userId: "owner", topicId: "target" })).toEqual([])

	// a third match only returns the existing validated identity
	stubHistory([...entries, toEntry("1", "Local models fit on small devices")])
	expect(await loadPersonalSourcesAiAgentRecommendations({ userId: "owner", topicId: "target" })).toEqual([aiAgent.id])
	expect(queries.every((query) => query.text.startsWith("select"))).toBe(true)
	expect(JSON.stringify(queries)).not.toContain("Language models on laptops")
})

test("history reads are sender-only, current, and limited to accepted OAuth sends", async () => {
	const queries = stubHistory([toEntry("1", "Local language models")])
	await loadPersonalSourcesAiAgentRecommendations({ userId: "owner", topicId: "target" })
	const historyQuery = queries.find((query) => query.text.includes('from "personal_source_entries"'))
	expect(historyQuery?.text).not.toContain("expires_at")
	expect(historyQuery?.text).toContain("interval '720 hours'")
	expect(historyQuery?.text).toContain('"team_members"."team_id" = "topics"."team_id"')
	expect(historyQuery?.text).toContain('"personal_source_entries"."user_id" =')
	expect(historyQuery?.values).toEqual(expect.arrayContaining(["owner", "send", "oauth:first", "oauth:second", 100]))

	// a different owner cannot cause a history read, even if the app is connected
	topicOwnerId = "another-owner"
	const refusedQueries = stubHistory([toEntry("1", "Local language models")])
	expect(await loadPersonalSourcesAiAgentRecommendations({ userId: "owner", topicId: "target" })).toBeNull()
	expect(refusedQueries.some((query) => query.text.includes('from "personal_source_entries"'))).toBe(false)
})

test("disconnected apps and unreadable ciphertext never create suggestions", async () => {
	// retired grants stop the read before any private history is decrypted
	spyOn(connections, "loadConnectedAiAgents").mockResolvedValue([{ ...aiAgent, isConnected: false }])
	const queries = stubHistory([toEntry("3", description), toEntry("2", description), toEntry("1", description)])
	expect(await loadPersonalSourcesAiAgentRecommendations({ userId: "owner", topicId: "target" })).toEqual([])
	expect(queries.some((query) => query.text.includes('from "personal_source_entries"'))).toBe(false)

	// missing keys cannot turn metadata into a recommendation
	spyOn(connections, "loadConnectedAiAgents").mockResolvedValue([aiAgent])
	delete Bun.env.CHAT_TEXT_KEY
	expect(await loadPersonalSourcesAiAgentRecommendations({ userId: "owner", topicId: "target" })).toEqual([])
})

test("matching uses whole normalized description words and ignores common filler", () => {
	expect(matchesPersonalSourcesTopicDescription({ description, text: "LOCAL language model benchmarks" })).toBe(true)
	expect(
		matchesPersonalSourcesTopicDescription({ description, text: "Locally roasting coffee with models on the label" }),
	).toBe(false)
	expect(matchesPersonalSourcesTopicDescription({ description: "the and of", text: "the and of" })).toBe(false)
	expect(matchesPersonalSourcesTopicDescription({ description: "Café", text: "CAFE\u0301 brewing" })).toBe(true)
})

// return only the columns selected by the real history query
function toEntry(id: string, text: string, clientId = "first"): unknown[] {
	const encryptedPayload = encryptPrivateText(
		JSON.stringify({
			title: "Accepted summary",
			text,
			sender: "Claude",
			senderKind: "agent",
			links: [],
			chatUrl: null,
		}),
	)
	return [id, encryptedPayload, `oauth:${clientId}`]
}

// authorize an eligible personal destination and provide one bounded history page
function stubHistory(entries: unknown[][]): ReturnType<typeof stubConnectionPool> {
	return stubConnectionPool(({ text }) => {
		if (text.includes('from "personal_source_entries"')) {
			return entries
		}
		return text.includes('from "topics"')
			? [
					toTableRow(topics, {
						id: "target",
						ownerId: topicOwnerId,
						visibility: "private",
						teamId: null,
						prompt: description,
					}),
				]
			: []
	})
}
