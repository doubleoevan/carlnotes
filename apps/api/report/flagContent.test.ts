// report tests: the daily rate limit window in Redis, the rejection of the eleventh report, a refunded report, a chat
// message report stored and mailed with its author blocked, and a message in a room the sender is not in rejected
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { DAY_MS } from "@carlnotes/contracts/time"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import { chatRoomMessages } from "@carlnotes/db/schema/chat"
import * as emails from "@carlnotes/emails/email"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { canReport, flagContentRoute, refundReport } from "./flagContent"

// put the spied functions and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	Bun.env.SUPPORT_EMAIL = undefined
})

// one message by another member in the team's own room, as its row reads
const CHAT_MESSAGE_ROW = toTableRow(chatRoomMessages, {
	id: 42,
	topicId: null,
	teamId: "team-1",
	authorUserId: "user-2",
	authorUsername: "vienna",
	replyToMessageId: null,
	content: "not-a-ciphertext",
	isSpoken: false,
	createdAt: new Date("2026-10-29T10:00:00.000Z"),
})

// the queries a chat message report sends: the message, its room's team and the sender's membership, the stored report,
// and the two usernames
function toReportQueryRows(isMember: boolean) {
	return ({ text }: { text: string }): unknown[] => {
		// the message and its room's team
		if (text.includes('from "room_messages"')) {
			return [CHAT_MESSAGE_ROW]
		}
		if (text.includes('from "teams"')) {
			return [["team-1"]]
		}
		// the sender's membership, which decides the read
		if (text.includes('from "team_members"')) {
			return isMember ? [["user-1"]] : []
		}
		// the stored report's id, and both usernames
		if (text.startsWith('insert into "reports"')) {
			return [["report-1"]]
		}
		return text.includes('from "users"') ? [["doubleoevan"]] : []
	}
}

// the tenth report of a day is allowed and the eleventh is rejected. the reports count under the user's Redis key for a day
test("the tenth report is allowed and the eleventh is rejected", async () => {
	const incrementRateLimitWindowSpy = spyOn(redisRateLimits, "incrementRateLimitWindow")
		.mockResolvedValueOnce({ count: 10, resetAt: 0 })
		.mockResolvedValueOnce({ count: 11, resetAt: 0 })
	expect(await canReport("user-1")).toBe(true)
	expect(await canReport("user-1")).toBe(false)
	expect(incrementRateLimitWindowSpy).toHaveBeenCalledWith("flags:user-1", DAY_MS)
})

// a refund decrements the same Redis key that the user's reports count under
test("a refund lowers the count on the user's key", async () => {
	const decrementRateLimitWindowSpy = spyOn(redisRateLimits, "decrementRateLimitWindow").mockResolvedValue(undefined)
	await refundReport("user-1")
	expect(decrementRateLimitWindowSpy).toHaveBeenCalledWith("flags:user-1")
})

// a member's report of a room message is stored with the message's author and text, blocks the author on request, and
// mails the support inbox with the console link
test("a room message report is stored, blocks its author, and is mailed", async () => {
	Bun.env.SUPPORT_EMAIL = "support@carlnotes.test"
	spyOn(redisRateLimits, "incrementRateLimitWindow").mockResolvedValue({ count: 1, resetAt: 0 })
	const sendEmailSpy = spyOn(emails, "sendEmail").mockResolvedValue(true)
	const sentQueries = stubConnectionPool(toReportQueryRows(true))

	// the report, with the author blocked in the same submission
	const response = await toSignedInApp(flagContentRoute, "user-1").request(
		"/flag-content",
		toJsonRequest({ subjectKind: "chatMessage", subjectId: "42", reason: "insults", shouldBlockAuthor: true }),
	)
	expect(response.status).toBe(200)

	// the stored report names the subject, its author, the reporter, and the reason
	const insertReportQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "reports"'))
	expect(insertReportQuery?.values).toEqual(
		expect.arrayContaining(["chatMessage", "42", "user-2", "user-1", "insults"]),
	)

	// the block, and the email with the console link
	const insertBlockQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "user_blocks"'))
	expect(insertBlockQuery?.values).toEqual(expect.arrayContaining(["user-1", "user-2"]))
	expect(sendEmailSpy).toHaveBeenCalledTimes(1)
	const sentEmail = sendEmailSpy.mock.calls[0]?.[0]
	expect(sentEmail?.to).toBe("support@carlnotes.test")
	expect(sentEmail?.subject).toContain("chat message reported")
	expect(sentEmail?.emailContent).toContain("/admin?report=report-1")
})

// a message in a room the sender is not a member of is rejected as not found, stores nothing, and mails nothing
test("a message the sender cannot see is rejected without a row or an email", async () => {
	Bun.env.SUPPORT_EMAIL = "support@carlnotes.test"
	spyOn(redisRateLimits, "incrementRateLimitWindow").mockResolvedValue({ count: 1, resetAt: 0 })
	const sendEmailSpy = spyOn(emails, "sendEmail").mockResolvedValue(true)
	const sentQueries = stubConnectionPool(toReportQueryRows(false))
	const response = await toSignedInApp(flagContentRoute, "user-1").request(
		"/flag-content",
		toJsonRequest({ subjectKind: "chatMessage", subjectId: "42", reason: "insults" }),
	)
	expect(response.status).toBe(404)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("insert"))).toBe(false)
	expect(sendEmailSpy).not.toHaveBeenCalled()
})

// a report the sender already made is accepted again, with no second row, no email, and its slot given back
test("a repeat report costs no slot and sends no email", async () => {
	Bun.env.SUPPORT_EMAIL = "support@carlnotes.test"
	spyOn(redisRateLimits, "incrementRateLimitWindow").mockResolvedValue({ count: 1, resetAt: 0 })
	const decrementRateLimitWindowSpy = spyOn(redisRateLimits, "decrementRateLimitWindow").mockResolvedValue(undefined)
	const sendEmailSpy = spyOn(emails, "sendEmail").mockResolvedValue(true)
	stubConnectionPool((sentQuery) =>
		sentQuery.text.startsWith('insert into "reports"') ? [] : toReportQueryRows(true)(sentQuery),
	)
	const response = await toSignedInApp(flagContentRoute, "user-1").request(
		"/flag-content",
		toJsonRequest({ subjectKind: "chatMessage", subjectId: "42", reason: "insults" }),
	)
	expect(response.status).toBe(200)
	expect(decrementRateLimitWindowSpy).toHaveBeenCalledWith("flags:user-1")
	expect(sendEmailSpy).not.toHaveBeenCalled()
})
