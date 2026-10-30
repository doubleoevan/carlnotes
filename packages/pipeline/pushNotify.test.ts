// push delivery tests: who a Scan push and a chat mention push reach, what each says and opens, how an accepted push
// is recorded so a retry skips it, and how a failed send ends
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as expoPush from "@carlnotes/server/expoPush"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { sendChatMentionPush, sendScanPush } from "./pushNotify"

// the rows each select gets, picked by the first pattern its SQL matches
type QueryRows = { sqlPattern: RegExp; rows: unknown[][] }

// the app url that the pushes link into, put back after each test
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_URL"])
beforeEach(() => {
	Bun.env.BETTER_AUTH_URL = "https://carlnotes.test"
})

// put the pool, the spies, and the app url back
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	restoreEnvSettings()
})

// the rows a Scan push reads: a succeeded Scan of its Topic and two new Findings. the digest subscribers are a subquery
// of the phones' read
const SCAN_PUSH_ROWS: QueryRows[] = [
	{ sqlPattern: /from "scans"/, rows: [["succeeded", "topic-1", "Home espresso"]] },
	{
		sqlPattern: /from "findings"/,
		rows: [
			["A cheaper grinder burr", "https://example.com/burr", "why"],
			["Descaling", "https://example.com/descale", "why"],
		],
	},
]

// two live phones of user-1 and one of user-2
const LIVE_PUSH_DEVICE_ROWS = [
	["device-1", "ExponentPushToken[one-a]", "user-1"],
	["device-2", "ExponentPushToken[one-b]", "user-1"],
	["device-3", "ExponentPushToken[two]", "user-2"],
]

// stub the pool to answer each select from the first matching rows, recording every query sent
function stubDatabase(queryRows: QueryRows[]): SentQuery[] {
	return stubConnectionPool(({ text: sql }) =>
		sql.startsWith("select") ? (queryRows.find((queryRow) => queryRow.sqlPattern.test(sql))?.rows ?? []) : [],
	)
}

// the sent query whose SQL starts with the given text
function findSentQuery(sentQueries: SentQuery[], sqlStart: string): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.startsWith(sqlStart))
}

// a succeeded Scan with new Findings pushes to each live phone of its digest recipients, records each accepted push,
// and retires the phone the service no longer knows
test("a Scan push reaches each live phone, records the accepted ones, and retires an unregistered one", async () => {
	// the service accepts the first two pushes and no longer knows the third phone
	const sentQueries = stubDatabase([
		...SCAN_PUSH_ROWS,
		{ sqlPattern: /from "push_devices"/, rows: LIVE_PUSH_DEVICE_ROWS },
	])
	const sendSpy = spyOn(expoPush, "sendPushMessageChunk").mockResolvedValue([
		{ status: "ok", id: "ticket-1" },
		{ status: "ok", id: "ticket-2" },
		{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
	])
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "sent", acceptedCount: 2 })

	// one message per phone, titled with the Topic, counting the Findings, and opening the Topic
	const [pushMessages] = sendSpy.mock.calls[0] ?? []
	expect(pushMessages?.map((pushMessage) => pushMessage.to)).toEqual([
		"ExponentPushToken[one-a]",
		"ExponentPushToken[one-b]",
		"ExponentPushToken[two]",
	])
	expect(pushMessages?.[0]).toMatchObject({
		title: "Home espresso",
		body: "2 new findings, including “A cheaper grinder burr”",
		channelId: "topic-scans",
		data: { kind: "topic-scan", url: "https://carlnotes.test/topics/topic-1/home-espresso", recipientUserId: "user-1" },
	})

	// the phones read are the digest recipients' with Topic pushes on and a live session, where a recipient is subscribed
	// with email on and, on a private Topic, still holds a role on it
	const devicesQuery = sentQueries.find((sentQuery) => /from "push_devices"/.test(sentQuery.text))
	expect(devicesQuery?.text).toContain('"users"."is_topic_push_enabled" = $')
	expect(devicesQuery?.text).toContain('"sessions"."expires_at" > $')
	expect(devicesQuery?.text).toContain('"subscriptions"."is_active" = $')
	expect(devicesQuery?.text).toContain('"subscriptions"."is_email_enabled" = $')
	expect(devicesQuery?.text).toContain('"topics"."visibility" <> $')
	expect(devicesQuery?.values).toContain(true)

	// the two accepted pushes are recorded once each, and the unregistered phone is deleted
	const recordQuery = findSentQuery(sentQueries, 'insert into "push_notification_sends"')
	expect(recordQuery?.text).toContain("on conflict do nothing")
	expect(recordQuery?.values).toEqual(expect.arrayContaining(["ticket-1", "ticket-2", "device-1", "device-2"]))
	expect(findSentQuery(sentQueries, 'delete from "push_devices"')?.values).toEqual(["device-3"])
})

// a retry sends only to the phones that no record names
test("a retried Scan push skips the phones that were already recorded", async () => {
	// the first phone was reached before the earlier attempt failed
	stubDatabase([
		...SCAN_PUSH_ROWS,
		{ sqlPattern: /from "push_devices"/, rows: LIVE_PUSH_DEVICE_ROWS },
		{ sqlPattern: /from "push_notification_sends"/, rows: [["user-1", "device-1"]] },
	])
	const sendSpy = spyOn(expoPush, "sendPushMessageChunk").mockResolvedValue([
		{ status: "ok", id: "ticket-2" },
		{ status: "ok", id: "ticket-3" },
	])

	// only the two unrecorded phones are sent to
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "sent", acceptedCount: 2 })
	expect(sendSpy.mock.calls[0]?.[0].map((pushMessage) => pushMessage.to)).toEqual([
		"ExponentPushToken[one-b]",
		"ExponentPushToken[two]",
	])
})

// a failed Scan, a Scan with nothing new, and a Scan with no phones to reach send nothing
test("a Scan push skips a failed Scan, a Scan with nothing new, and a Scan with no phones", async () => {
	const sendSpy = spyOn(expoPush, "sendPushMessageChunk").mockResolvedValue([])

	// a failed Scan
	stubDatabase([{ sqlPattern: /from "scans"/, rows: [["failed", "topic-1", "Home espresso"]] }])
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "skipped" })

	// a succeeded Scan that kept nothing new
	stubDatabase([{ sqlPattern: /from "scans"/, rows: [["succeeded", "topic-1", "Home espresso"]] }])
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "skipped" })

	// recipients with no live phone, or with Topic pushes off, which the devices query leaves out
	stubDatabase(SCAN_PUSH_ROWS)
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "skipped" })
	expect(sendSpy).not.toHaveBeenCalled()
})

// a rate limit or a server error is retryable, a rejected request is final, and a retryable ticket error is retryable
test("a failed send says whether another attempt can help", async () => {
	stubDatabase([...SCAN_PUSH_ROWS, { sqlPattern: /from "push_devices"/, rows: LIVE_PUSH_DEVICE_ROWS }])
	const sendSpy = spyOn(expoPush, "sendPushMessageChunk")

	// the request itself fails
	sendSpy.mockRejectedValueOnce(Object.assign(new Error("too many requests"), { statusCode: 429 }))
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "retryable", pushError: "too many requests" })
	sendSpy.mockRejectedValueOnce(Object.assign(new Error("bad request"), { statusCode: 400 }))
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "rejected", pushError: "bad request" })

	// one ticket is rate limited and one has bad credentials, so the send retries
	sendSpy.mockResolvedValueOnce([
		{ status: "ok", id: "ticket-1" },
		{ status: "error", message: "slow down", details: { error: "MessageRateExceeded" } },
		{ status: "error", message: "credentials", details: { error: "InvalidCredentials" } },
	])
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "retryable", pushError: "MessageRateExceeded" })
})

// the message a mention push reads: in a Topic's room, by alex, replying to sam's message 7
const ROOM_MESSAGE_ROW = ["team-1", "topic-1", "user-alex", "alex", 7, "Home espresso", "Roasters"]

// the rows a mention push reads: the message, the held Topic, two reachable members, and the replied-to author
function toMentionPushRows(chatMessageRow: unknown[]): QueryRows[] {
	return [
		{ sqlPattern: /from "room_messages" inner join "teams"/, rows: [chatMessageRow] },
		{ sqlPattern: /from "team_topics"/, rows: [["topic-1"]] },
		{ sqlPattern: /from "room_mentions"/, rows: [["user-sam"], ["user-kim"]] },
		{ sqlPattern: /from "room_messages"/, rows: [["user-sam"]] },
		{
			sqlPattern: /from "push_devices"/,
			rows: [
				["device-sam", "ExponentPushToken[sam]", "user-sam"],
				["device-kim", "ExponentPushToken[kim]", "user-kim"],
			],
		},
	]
}

// a reply pushes "replied", a mention pushes "mentioned", both titled with the room and opening it, never the text
test("a mention push names the sender and the room and opens the room", async () => {
	const sentQueries = stubDatabase(toMentionPushRows(ROOM_MESSAGE_ROW))
	const sendSpy = spyOn(expoPush, "sendPushMessageChunk").mockResolvedValue([
		{ status: "ok", id: "ticket-sam" },
		{ status: "ok", id: "ticket-kim" },
	])
	expect(await sendChatMentionPush(44)).toEqual({ outcome: "sent", acceptedCount: 2 })

	// sam was replied to and kim was mentioned, in the Topic's room for this Team
	const [samMessage, kimMessage] = sendSpy.mock.calls[0]?.[0] ?? []
	expect(samMessage).toMatchObject({ title: "Home espresso", body: "alex replied to you", channelId: "chat-mentions" })
	expect(kimMessage?.body).toBe("alex mentioned you")
	expect(samMessage?.data).toEqual({
		kind: "chat-mention",
		url: "https://carlnotes.test/topics/topic-1/chat?chatTeamId=team-1",
		recipientUserId: "user-sam",
	})

	// the members are read on the Team, minus the author, the blockers of the author, and the reporters of the message
	const mentionsQuery = sentQueries.find((sentQuery) => /from "room_mentions"/.test(sentQuery.text))
	expect(mentionsQuery?.text).toContain('inner join "team_members"')
	expect(mentionsQuery?.text).toContain('"team_members"."is_active" = $')
	expect(mentionsQuery?.text).toContain('"room_mentions"."user_id" <> $')
	expect(mentionsQuery?.text).toContain('from "user_blocks"')
	expect(mentionsQuery?.text).toContain('from "reports"')
	expect(mentionsQuery?.values).toContain("user-alex")

	// only the reachable members' phones with mention pushes on are read, so a phone that moved to another account
	// is not among them
	const devicesQuery = sentQueries.find((sentQuery) => /from "push_devices"/.test(sentQuery.text))
	expect(devicesQuery?.text).toContain('"users"."is_chat_mention_push_enabled" = $')
	expect(devicesQuery?.values).toEqual(expect.arrayContaining(["user-sam", "user-kim"]))
	expect(devicesQuery?.values).not.toContain("user-alex")
	expect(samMessage?.body).not.toContain("hello")
})

// the Team's own room is titled with the Team and opens the Team's room
test("a mention in the Team's own room opens the Team's room", async () => {
	stubDatabase(toMentionPushRows(["team-1", null, "user-alex", "alex", null, null, "Roasters"]))
	const sendSpy = spyOn(expoPush, "sendPushMessageChunk").mockResolvedValue([
		{ status: "ok", id: "ticket-sam" },
		{ status: "ok", id: "ticket-kim" },
	])
	await sendChatMentionPush(45)
	expect(sendSpy.mock.calls[0]?.[0][0]).toMatchObject({
		title: "Roasters",
		body: "alex mentioned you",
		data: { url: "https://carlnotes.test/teams/team-1/chat" },
	})
})

// a deleted message, and a Topic room whose Topic the Team no longer holds, send nothing
test("a mention push skips a deleted message and a room the Team no longer holds", async () => {
	const sendSpy = spyOn(expoPush, "sendPushMessageChunk").mockResolvedValue([])

	// the message is gone
	stubDatabase([])
	expect(await sendChatMentionPush(44)).toEqual({ outcome: "skipped" })

	// the Topic left the Team
	stubDatabase(
		toMentionPushRows(ROOM_MESSAGE_ROW).filter((queryRow) => !/team_topics/.test(String(queryRow.sqlPattern))),
	)
	expect(await sendChatMentionPush(44)).toEqual({ outcome: "skipped" })
	expect(sendSpy).not.toHaveBeenCalled()
})

// a chunk the service rejects for mixing Expo projects is sent again without the other project's token, whose phone
// is retired
test("a foreign project's token is retired and the rest of the chunk still sends", async () => {
	// the first request names one token under another project, and the resend is accepted
	const sentQueries = stubDatabase([
		...SCAN_PUSH_ROWS,
		{ sqlPattern: /from "push_devices"/, rows: LIVE_PUSH_DEVICE_ROWS },
	])
	const mixedProjectsError = Object.assign(new Error("mixed projects"), {
		statusCode: 400,
		code: "PUSH_TOO_MANY_EXPERIENCE_IDS",
		details: {
			"@carlnotes/carlnotes": ["ExponentPushToken[one-a]", "ExponentPushToken[two]"],
			"@someone/other": ["ExponentPushToken[one-b]"],
		},
	})
	const sendSpy = spyOn(expoPush, "sendPushMessageChunk")
		.mockRejectedValueOnce(mixedProjectsError)
		.mockResolvedValueOnce([
			{ status: "ok", id: "ticket-1" },
			{ status: "ok", id: "ticket-3" },
		])

	// the resend leaves out the foreign token, and its phone is deleted
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "sent", acceptedCount: 2 })
	expect(sendSpy.mock.calls[1]?.[0].map((pushMessage) => pushMessage.to)).toEqual([
		"ExponentPushToken[one-a]",
		"ExponentPushToken[two]",
	])
	const retireQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "push_devices"'))
	expect(retireQuery?.values).toEqual(["ExponentPushToken[one-b]"])
})

// a rejected chunk is kept as a final error, and the chunks after it still send
test("a rejected chunk never stops the chunks after it", async () => {
	// 150 phones in two chunks, the first rejected whole
	const manyDeviceRows = Array.from({ length: 150 }, (_, index) => [
		`device-${index}`,
		`ExponentPushToken[${index}]`,
		"user-1",
	])
	stubDatabase([...SCAN_PUSH_ROWS, { sqlPattern: /from "push_devices"/, rows: manyDeviceRows }])
	const sendSpy = spyOn(expoPush, "sendPushMessageChunk")
		.mockRejectedValueOnce(Object.assign(new Error("bad request"), { statusCode: 400 }))
		.mockImplementationOnce(async (pushMessageChunk) =>
			pushMessageChunk.map((_, index) => ({ status: "ok" as const, id: `ticket-${index}` })),
		)

	// the second chunk goes out, and the send ends rejected for the first
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "rejected", pushError: "bad request" })
	expect(sendSpy).toHaveBeenCalledTimes(2)
})

// a long send reports each chunk, and a cancelled attempt stops before its next chunk
test("a send reports each chunk and stops once cancelled", async () => {
	// 150 phones, two chunks, every push accepted
	const manyDeviceRows = Array.from({ length: 150 }, (_, index) => [
		`device-${index}`,
		`ExponentPushToken[${index}]`,
		"user-1",
	])
	stubDatabase([...SCAN_PUSH_ROWS, { sqlPattern: /from "push_devices"/, rows: manyDeviceRows }])
	spyOn(expoPush, "sendPushMessageChunk").mockImplementation(async (pushMessageChunk) =>
		pushMessageChunk.map((_, index) => ({ status: "ok" as const, id: `ticket-${index}` })),
	)

	// both chunks report
	const onChunkSent = mock(() => {})
	expect(await sendScanPush("scan-1", { onChunkSent, isCancelled: () => false })).toEqual({
		outcome: "sent",
		acceptedCount: 150,
	})
	expect(onChunkSent).toHaveBeenCalledTimes(2)

	// a cancel after the first chunk stops the second
	let isCancelled = false
	const cancelledResult = await sendScanPush("scan-1", {
		onChunkSent: () => {
			isCancelled = true
		},
		isCancelled: () => isCancelled,
	})
	expect(cancelledResult).toEqual({ outcome: "retryable", pushError: "cancelled" })
})

// a phone that moved to another account after the send was planned gets nothing of the earlier account's
test("a phone rebound to another account since the plan is left out of its chunk", async () => {
	// the plan reads three phones, and the recheck finds device-2 now bound to another account
	stubDatabase([
		...SCAN_PUSH_ROWS,
		{
			sqlPattern: /"push_devices"\."id" in/,
			rows: [
				["device-1", "ExponentPushToken[one-a]", "user-1"],
				["device-2", "ExponentPushToken[one-b]", "user-other"],
				["device-3", "ExponentPushToken[two]", "user-2"],
			],
		},
		{ sqlPattern: /from "push_devices"/, rows: LIVE_PUSH_DEVICE_ROWS },
	])
	const sendSpy = spyOn(expoPush, "sendPushMessageChunk").mockResolvedValue([
		{ status: "ok", id: "ticket-1" },
		{ status: "ok", id: "ticket-3" },
	])

	// only the two phones still bound to their recipient are sent to
	expect(await sendScanPush("scan-1")).toEqual({ outcome: "sent", acceptedCount: 2 })
	expect(sendSpy.mock.calls[0]?.[0].map((pushMessage) => pushMessage.to)).toEqual([
		"ExponentPushToken[one-a]",
		"ExponentPushToken[two]",
	])
})
