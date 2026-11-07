// service checks refuse stale identity before allowance and never persist a Topic-matching request
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as connections from "@carlnotes/db/aiAgentConnections"
import * as quota from "@carlnotes/db/personalSourcesQuota"
import * as confirmation from "@carlnotes/db/personalSourcesReceive"
import * as batch from "@carlnotes/db/personalSourcesSend"
import * as analytics from "@carlnotes/server/analytics"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import * as matching from "./matchTopics"
import { sendToPersonalSources } from "./send"
import * as work from "./work"

// no fixture reaches the network or database
let restoreEnvSettings: () => void
const sender = { kind: "oauth", userId: "owner", clientId: "registered" } as const
const payload = { topic_id: "bound", title: "A title", summary: "private-canary", links: [] }
const analyticsProperties = { entryPoint: "mcp", plan: "premium" }

// the confirmation an accepted send returns for each Topic
type SendConfirmation = { topic: { id: string; name: string; url: string }; entryId: string; queuedLinkCount: number }

// each test sets its env settings
beforeEach(() => {
	restoreEnvSettings = saveEnvSettings(["CHAT_TEXT_KEY", "PERSONAL_SOURCES_RECEIVING_ENABLED"])
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "true"
	Bun.env.CHAT_TEXT_KEY = Buffer.alloc(32, 5).toString("base64")
})

// each test restores its spies and env settings
afterEach(() => {
	mock.restore()
	restoreEnvSettings()
})

// a current grant carries its derived app identity
function connectAiAgent(): void {
	spyOn(connections, "loadLiveAiAgent").mockResolvedValue({
		id: "domain:claude.ai",
		label: "Claude",
		domain: "claude.ai",
		clientIds: ["registered"],
		isConnected: true,
		consentCreatedAt: null,
	})
}

test("disconnected identity stops before allowance, ranking, or persistence", async () => {
	spyOn(connections, "loadLiveAiAgent").mockResolvedValue(null)
	const allowance = spyOn(quota, "readPersonalSourcesAllowance")
	const receiveSpy = spyOn(confirmation, "receivePersonalSourceEntry")
	expect(await sendToPersonalSources({ sender, analyticsProperties, payload })).toEqual({ status: "disconnected" })
	expect(allowance).not.toHaveBeenCalled()
	expect(receiveSpy).not.toHaveBeenCalled()
})

test("a send without a Topic is rejected before identity, quota, matching, or persistence", async () => {
	const identity = spyOn(connections, "loadLiveAiAgent")
	const receiveSpy = spyOn(confirmation, "receivePersonalSourceEntry")
	const rank = spyOn(matching, "matchPersonalSourcesTopics")
	const { topic_id: _topic, ...payloadWithoutTopicId } = payload
	await expect(
		sendToPersonalSources({ sender, analyticsProperties, payload: payloadWithoutTopicId as typeof payload }),
	).rejects.toThrow()
	expect(identity).not.toHaveBeenCalled()
	expect(receiveSpy).not.toHaveBeenCalled()
	expect(rank).not.toHaveBeenCalled()
})

test("the explicit Topic matches the binding and a different supplied Topic is refused", async () => {
	connectAiAgent()
	const receiveSpy = spyOn(confirmation, "receivePersonalSourceEntry").mockResolvedValue({ status: "not_found" })
	await sendToPersonalSources({ sender, analyticsProperties, payload, routeTopicId: "bound" })
	expect(receiveSpy.mock.calls[0]?.[0]).toMatchObject({
		topicId: "bound",
		senderIdentity: "oauth:registered",
		payload: { sender: "Claude", senderKind: "agent" },
	})
	expect(
		await sendToPersonalSources({
			sender,
			analyticsProperties,
			payload: { ...payload, topic_id: "other" },
			routeTopicId: "bound",
		}),
	).toEqual({
		status: "not_found",
	})
	expect(receiveSpy).toHaveBeenCalledTimes(1)
})

test("disabled receiving and missing encryption fail without persistence", async () => {
	connectAiAgent()
	const receiveSpy = spyOn(confirmation, "receivePersonalSourceEntry")
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "false"
	expect(await sendToPersonalSources({ sender, analyticsProperties, payload })).toEqual({
		status: "unavailable",
		reason: "disabled",
	})
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "true"
	delete Bun.env.CHAT_TEXT_KEY
	expect(
		await sendToPersonalSources({ sender, analyticsProperties, payload: { ...payload, topic_id: "topic" } }),
	).toEqual({
		status: "unavailable",
		reason: "encryption",
	})
	expect(receiveSpy).not.toHaveBeenCalled()
})

test("all array destinations reach one atomic receiver, while a bound route rejects a different id before identity", async () => {
	connectAiAgent()
	const receiveSpy = spyOn(batch, "receivePersonalSourcesSend").mockResolvedValue({ status: "not_found" })
	const multi = { title: payload.title, summary: payload.summary, links: [], topic_ids: ["one", "two"] }
	await sendToPersonalSources({ sender, analyticsProperties, payload: multi })
	expect(receiveSpy).toHaveBeenCalledTimes(1)
	expect(receiveSpy.mock.calls[0]?.[0]).toMatchObject({
		topicIds: ["one", "two"],
		senderIdentity: "oauth:registered",
		payload: { text: "private-canary" },
	})
	const identity = spyOn(connections, "loadLiveAiAgent").mockClear()
	expect(await sendToPersonalSources({ sender, analyticsProperties, payload: multi, routeTopicId: "one" })).toEqual({
		status: "not_found",
	})
	expect(identity).not.toHaveBeenCalled()
	expect(receiveSpy).toHaveBeenCalledTimes(1)
})

test("an accepted send reports its counts, and no event holds its title, text, or Topic name", async () => {
	connectAiAgent()
	spyOn(work, "notifyPersonalSourcesChanged").mockResolvedValue()
	const trackEventSpy = spyOn(analytics, "trackEvent")

	// one Topic's confirmation, with the Topic name that no event may include
	const toConfirmation = (topicId: string, queuedLinkCount: number): SendConfirmation => ({
		topic: { id: topicId, name: "private-topic-name", url: `https://carlnotes.com/topics/${topicId}` },
		entryId: `entry-${topicId}`,
		queuedLinkCount,
	})

	// a send to one Topic
	const oneTopic = { status: "accepted", title: "private-title", ...toConfirmation("bound", 2) } as const
	spyOn(confirmation, "receivePersonalSourceEntry").mockResolvedValue(oneTopic)
	await sendToPersonalSources({ sender, analyticsProperties, payload })

	// a send that two Topics share
	spyOn(batch, "receivePersonalSourcesSend").mockResolvedValue({
		...oneTopic,
		confirmations: [toConfirmation("bound", 2), toConfirmation("second", 3)],
	})
	const { topic_id: _topicId, ...payloadWithoutTopicId } = payload
	await sendToPersonalSources({
		sender,
		analyticsProperties,
		payload: { ...payloadWithoutTopicId, topic_ids: ["bound", "second"] },
	})

	// each send reports its entries and queued links
	const properties = { ...analyticsProperties, origin: "send" }
	expect(trackEventSpy.mock.calls).toEqual([
		["personal_source_entry_received", "owner", { ...properties, topicId: "bound", entryCount: 1, queuedLinkCount: 2 }],
		["personal_source_entry_received", "owner", { ...properties, entryCount: 2, queuedLinkCount: 5 }],
	])
	expect(JSON.stringify(trackEventSpy.mock.calls)).not.toContain("private-")
})

test("a send past the daily limit and a rejected send each report why, and a lost grant has no user to report", async () => {
	connectAiAgent()
	const trackEventSpy = spyOn(analytics, "trackEvent")
	const receiveSpy = spyOn(confirmation, "receivePersonalSourceEntry")

	// a send past the limit, then a send to a removed Source
	receiveSpy.mockResolvedValueOnce({ status: "quota", resetAt: "2026-11-05T00:00:00.000Z" })
	await sendToPersonalSources({ sender, analyticsProperties, payload })
	receiveSpy.mockResolvedValueOnce({ status: "conflict", reason: "removed" })
	await sendToPersonalSources({ sender, analyticsProperties, payload })

	// each send reports why it stopped
	const properties = { ...analyticsProperties, origin: "send" }
	expect(trackEventSpy.mock.calls).toEqual([
		["personal_sources_quota_reached", "owner", properties],
		["personal_sources_send_rejected", "owner", { ...properties, reason: "conflict" }],
	])

	// a sender with no live grant stops before any event
	trackEventSpy.mockClear()
	spyOn(connections, "loadLiveAiAgent").mockResolvedValue(null)
	await sendToPersonalSources({ sender, analyticsProperties, payload })
	expect(trackEventSpy).not.toHaveBeenCalled()
})
