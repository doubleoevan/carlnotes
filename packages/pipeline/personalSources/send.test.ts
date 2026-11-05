// service checks refuse stale identity before allowance and never persist a Topic-matching request
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as connections from "@carlnotes/db/aiAgentConnections"
import * as quota from "@carlnotes/db/personalSourcesQuota"
import * as receipt from "@carlnotes/db/personalSourcesReceive"
import * as batch from "@carlnotes/db/personalSourcesSend"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import * as matching from "./matchTopics"
import { sendToPersonalSources } from "./send"

// no fixture reaches the network or database
let restoreEnvSettings: () => void
const sender = { kind: "oauth", userId: "owner", clientId: "registered" } as const
const payload = { topic_id: "bound", title: "A title", summary: "private-canary", links: [] }
beforeEach(() => {
	restoreEnvSettings = saveEnvSettings(["CHAT_TEXT_KEY", "PERSONAL_SOURCES_RECEIVING_ENABLED"])
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "true"
	Bun.env.CHAT_TEXT_KEY = Buffer.alloc(32, 5).toString("base64")
})
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
	const receive = spyOn(receipt, "receivePersonalSourceEntry")
	expect(await sendToPersonalSources({ sender, payload })).toEqual({ status: "disconnected" })
	expect(allowance).not.toHaveBeenCalled()
	expect(receive).not.toHaveBeenCalled()
})

test("a send without a Topic is rejected before identity, quota, matching, or persistence", async () => {
	const identity = spyOn(connections, "loadLiveAiAgent")
	const receive = spyOn(receipt, "receivePersonalSourceEntry")
	const rank = spyOn(matching, "matchPersonalSourcesTopics")
	const { topic_id: _topic, ...untargeted } = payload
	await expect(sendToPersonalSources({ sender, payload: untargeted as typeof payload })).rejects.toThrow()
	expect(identity).not.toHaveBeenCalled()
	expect(receive).not.toHaveBeenCalled()
	expect(rank).not.toHaveBeenCalled()
})

test("the explicit Topic matches the binding and a different supplied Topic is refused", async () => {
	connectAiAgent()
	const receive = spyOn(receipt, "receivePersonalSourceEntry").mockResolvedValue({ status: "not_found" })
	await sendToPersonalSources({ sender, payload, routeTopicId: "bound" })
	expect(receive.mock.calls[0]?.[0]).toMatchObject({
		topicId: "bound",
		senderIdentity: "oauth:registered",
		payload: { sender: "Claude", senderKind: "agent" },
	})
	expect(
		await sendToPersonalSources({ sender, payload: { ...payload, topic_id: "other" }, routeTopicId: "bound" }),
	).toEqual({
		status: "not_found",
	})
	expect(receive).toHaveBeenCalledTimes(1)
})

test("disabled receiving and missing encryption fail without persistence", async () => {
	connectAiAgent()
	const receive = spyOn(receipt, "receivePersonalSourceEntry")
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "false"
	expect(await sendToPersonalSources({ sender, payload })).toEqual({ status: "unavailable", reason: "disabled" })
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "true"
	delete Bun.env.CHAT_TEXT_KEY
	expect(await sendToPersonalSources({ sender, payload: { ...payload, topic_id: "topic" } })).toEqual({
		status: "unavailable",
		reason: "encryption",
	})
	expect(receive).not.toHaveBeenCalled()
})

test("all array destinations reach one atomic receiver, while a bound route rejects a different id before identity", async () => {
	connectAiAgent()
	const receive = spyOn(batch, "receivePersonalSourcesSend").mockResolvedValue({ status: "not_found" })
	const multi = { title: payload.title, summary: payload.summary, links: [], topic_ids: ["one", "two"] }
	await sendToPersonalSources({ sender, payload: multi })
	expect(receive).toHaveBeenCalledTimes(1)
	expect(receive.mock.calls[0]?.[0]).toMatchObject({
		topicIds: ["one", "two"],
		senderIdentity: "oauth:registered",
		payload: { text: "private-canary" },
	})
	const identity = spyOn(connections, "loadLiveAiAgent").mockClear()
	expect(await sendToPersonalSources({ sender, payload: multi, routeTopicId: "one" })).toEqual({ status: "not_found" })
	expect(identity).not.toHaveBeenCalled()
	expect(receive).toHaveBeenCalledTimes(1)
})
