// report tests: the daily rate limit window in Redis, the rejection of the report past the fiftieth, a refunded report, a chat
// message report stored and mailed with its author blocked, a message in a room the sender is not in rejected, and a
// comment's hot take flag event
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { DAY_MS } from "@carlnotes/contracts/time"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import { chatRoomMessages } from "@carlnotes/db/schema/chat"
import * as emails from "@carlnotes/emails/email"
import * as analytics from "@carlnotes/server/analytics"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { canReport, flagContent, flagContentRoute, refundReport } from "./flagContent"
import * as reportSubjects from "./reportSubjects"
import * as reports from "./reports"

// put the spied functions, the connection pool, and the auth secret back after each test
const restoreAuthSecret = saveEnvSettings(["BETTER_AUTH_SECRET"])
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreAuthSecret()
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

// the fiftieth report of a day is allowed and the next is rejected. the reports count under the user's Redis key for
// a day
test("a user reads whether they reported a subject", async () => {
	stubConnectionPool(toReportQueryRows(true))
	spyOn(reports, "hasReportedSubject").mockResolvedValue(true)

	const response = await toSignedInApp(flagContentRoute, "user-1").request(
		"/flag-content?subjectKind=podcastEpisode&subjectId=episode-1",
	)

	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ isReported: true })
	expect(reports.hasReportedSubject).toHaveBeenCalledWith("user-1", "podcastEpisode", "episode-1")
})

test("the fiftieth report is allowed and the next is rejected", async () => {
	const incrementRateLimitWindowSpy = spyOn(redisRateLimits, "incrementRateLimitWindow")
		.mockResolvedValueOnce({ count: 50, resetAt: 0 })
		.mockResolvedValueOnce({ count: 51, resetAt: 0 })
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

// a member's report of a room message is stored with the message's author and text, puts a user block on the author on request, and
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

	// the user block, and the email with the console link
	const insertUserBlockQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "user_blocks"'))
	expect(insertUserBlockQuery?.values).toEqual(expect.arrayContaining(["user-1", "user-2"]))
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

// a report belongs to its sender, so the removal names the signed-in user
test("removing a report removes the sender's own", async () => {
	const removeReportSpy = spyOn(reports, "removeReport").mockResolvedValue(undefined)
	const response = await toSignedInApp(flagContentRoute, "user-1").request(
		"/flag-content?subjectKind=finding&subjectId=finding-1",
		{ method: "DELETE" },
	)
	expect(response.status).toBe(200)
	expect(removeReportSpy).toHaveBeenCalledWith("user-1", "finding", "finding-1")
})

// a report the sender already made is accepted again, with no second row, no email, and its slot given back
test("a repeat report costs no slot and sends no email", async () => {
	Bun.env.SUPPORT_EMAIL = "support@carlnotes.test"
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
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

// a flag of a comment sends the hot take flag event beside the general one, with the comment's id and none of its words
test("a comment's flag sends the hot take flag event with its id and no text", async () => {
	Bun.env.SUPPORT_EMAIL = "support@carlnotes.test"
	spyOn(redisRateLimits, "incrementRateLimitWindow").mockResolvedValue({ count: 1, resetAt: 0 })
	spyOn(emails, "sendEmail").mockResolvedValue(true)
	spyOn(reportSubjects, "toReportedSubject").mockResolvedValue({
		kind: "comment",
		id: "comment-1",
		label: "a hot take on A Good Page",
		path: "/topics/topic-1/a-good-page",
		text: "rude words",
		authorUserId: "user-2",
	})

	// the events the route sends, the stored report's id, and the username the email reads
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	stubConnectionPool(({ text }) => {
		if (text.startsWith('insert into "reports"')) {
			return [["report-1"]]
		}
		return text.includes('from "users"') ? [["vienna"]] : []
	})
	const response = await toSignedInApp(flagContentRoute, "user-1").request(
		"/flag-content",
		toJsonRequest({ subjectKind: "comment", subjectId: "comment-1", reason: "insults", shouldBlockAuthor: false }),
	)
	expect(response.status).toBe(200)

	// the general event names the kind, and the social event names the comment as a hot take
	const socialFlagCall = trackEventSpy.mock.calls.find(([event]) => event === "social_hot_take_flag")
	expect(trackEventSpy.mock.calls.map(([event]) => event)).toEqual(["content_flagged", "social_hot_take_flag"])
	expect(socialFlagCall?.[1]).toBe("user-1")
	expect(socialFlagCall?.[2]).toMatchObject({ objectId: "comment-1" })
	expect(JSON.stringify(trackEventSpy.mock.calls)).not.toMatch(/rude words|insults|vienna/)
})

// a report sent through the module, as the MCP tool sends one, records the same event the route does
test("flagContent records the report's event itself", async () => {
	Bun.env.SUPPORT_EMAIL = "support@carlnotes.test"
	spyOn(redisRateLimits, "incrementRateLimitWindow").mockResolvedValue({ count: 1, resetAt: 0 })
	spyOn(emails, "sendEmail").mockResolvedValue(true)
	spyOn(reportSubjects, "toReportedSubject").mockResolvedValue({
		kind: "topic",
		id: "topic-1",
		label: "A Good Page",
		path: "/topics/topic-1/a-good-page",
		text: "A Good Page",
		authorUserId: "user-2",
	})

	// the events the module sends, the stored report's id, and the username the email reads
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	stubConnectionPool(({ text }) => {
		if (text.startsWith('insert into "reports"')) {
			return [["report-1"]]
		}
		return text.includes('from "users"') ? [["vienna"]] : []
	})
	const flagContentResult = await flagContent({
		userId: "user-1",
		payload: { subjectKind: "topic", subjectId: "topic-1", reason: "spam", shouldBlockAuthor: false },
		analyticsProperties: { platform: "mcp" } as never,
	})

	// the report was sent, and its event names the kind with the caller's properties
	expect(flagContentResult).toBe("sent")
	expect(trackEventSpy.mock.calls[0]?.[0]).toBe("content_flagged")
	expect(trackEventSpy.mock.calls[0]?.[2]).toMatchObject({ kind: "topic", platform: "mcp" })
})

// a body image's report is stored under its post and image, beside the post's author
test("a body image report is stored under its post and image", async () => {
	Bun.env.SUPPORT_EMAIL = "support@carlnotes.test"
	spyOn(redisRateLimits, "incrementRateLimitWindow").mockResolvedValue({ count: 1, resetAt: 0 })
	spyOn(emails, "sendEmail").mockResolvedValue(true)
	spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const subjectId = "post-1/image-1"
	const toReportedSubjectSpy = spyOn(reportSubjects, "toReportedSubject").mockResolvedValue({
		kind: "topicPostBodyImage",
		id: subjectId,
		label: "Light roasts",
		path: "/topics/topic-1/home-espresso/posts/post-1/light-roasts",
		text: "Light roasts",
		authorUserId: "user-2",
	})

	// the stored report's id, and the username the email reads
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith('insert into "reports"')) {
			return [["report-1"]]
		}
		return text.includes('from "users"') ? [["vienna"]] : []
	})
	const response = await toSignedInApp(flagContentRoute, "user-1").request(
		"/flag-content",
		toJsonRequest({ subjectKind: "topicPostBodyImage", subjectId, reason: "not mine" }),
	)
	expect(response.status).toBe(200)
	expect(toReportedSubjectSpy).toHaveBeenCalledWith(
		"user-1",
		expect.objectContaining({ subjectKind: "topicPostBodyImage", subjectId }),
	)

	// the stored report names the body image, its post's author, and the reporter
	const insertReportQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "reports"'))
	expect(insertReportQuery?.values).toEqual(
		expect.arrayContaining(["topicPostBodyImage", subjectId, "user-2", "user-1", "not mine"]),
	)
})
