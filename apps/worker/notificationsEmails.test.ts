// notifications email sweep tests: one email a day per recipient, none on a quiet day or before the send hour, a
// quiet day recorded once, what an email covers, the activity a recipient may read, and a rejected send that gives its
// day back
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as authorization from "@carlnotes/db/authorization"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as findingPermissions from "@carlnotes/db/findingPermissions"
import * as quotas from "@carlnotes/db/quotas"
import * as topicPermissions from "@carlnotes/db/topicPermissions"
import * as email from "@carlnotes/emails/email"
import * as notificationsEmail from "@carlnotes/emails/notifications-email"
import { sendDayNotificationsEmails, sendNotificationsEmails } from "./notificationsEmails"
import {
	NO_TOPIC_POST,
	NOW,
	stubSweepRows,
	TODAY,
	toActivityRow,
	toCreatedAt,
	toReactionRow,
} from "./notificationsEmailTestFixtures"

// the inserts into the sends table that a sweep sent
function findSendInserts(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => sentQuery.text.startsWith('insert into "notifications_email_sends"'))
}

// the mailer, which accepts every send unless a case says otherwise
let sendEmail: ReturnType<typeof spyOn<typeof email, "sendEmail">>
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET ??= "test-secret"
	sendEmail = spyOn(email, "sendEmail").mockResolvedValue(true)
})

// put the mailer and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

test("nothing is read or sent before the send hour", async () => {
	const sentQueries = stubSweepRows({ reactionRows: [toReactionRow("roastfan")] })
	expect(await sendNotificationsEmails(new Date("2026-11-06T14:59:00Z"))).toBe(0)
	expect(sentQueries).toHaveLength(0)
	expect(sendEmail).not.toHaveBeenCalled()
})

test("a reaction and a comment make one email that names both, with the day's row written first", async () => {
	const sentQueries = stubSweepRows({
		reactionRows: [toReactionRow("roastfan"), toReactionRow("latte", 30)],
		commentRows: [toActivityRow("roastfan", "so true", 45)],
	})
	expect(await sendDayNotificationsEmails(NOW)).toBe(1)

	// one email to the owner, newest first, with the unsubscribe headers
	expect(sendEmail).toHaveBeenCalledTimes(1)
	const [message] = sendEmail.mock.calls[0] ?? []
	expect(message?.to).toBe("owner@example.com")
	expect(message?.subject).toBe("Carl left you a note: 1 hot take, 2 reactions")
	expect(message?.emailKind).toBe("notifications")
	expect(message?.plainTextContent).toContain("latte reacted Insightful to Coffee")
	expect(message?.plainTextContent).toContain("roastfan left a hot take on Coffee")
	expect(message?.plainTextContent).toContain("so true")

	// the newer reaction reads before the older Comment
	expect(message?.plainTextContent?.indexOf("latte reacted")).toBeLessThan(
		message?.plainTextContent?.indexOf("so true") ?? -1,
	)
	expect(message?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")

	// the day's row holds the user, the day, and the end of the time the email covered
	const insertQuery = sentQueries.find((sentQuery) =>
		sentQuery.text.startsWith('insert into "notifications_email_sends"'),
	)
	expect(insertQuery?.values.slice(0, 2)).toEqual(["owner-1", TODAY])
})

test("a quiet day sends nothing, and is recorded so the day's later sweeps read that person no more", async () => {
	const sentQueries = stubSweepRows({})
	expect(await sendDayNotificationsEmails(NOW)).toBe(0)
	expect(sendEmail).not.toHaveBeenCalled()

	// one insert records the day as quiet for the person, with the time of the check
	const [quietDayInsert, ...otherInserts] = findSendInserts(sentQueries)
	expect(otherInserts).toEqual([])
	expect(quietDayInsert?.text).toContain("on conflict do nothing")
	expect(quietDayInsert?.values).toEqual(["owner-1", TODAY, NOW.toISOString(), true])

	// the next sweep of the day finds nobody to read: one read of the recipients, and none of any activity
	sentQueries.length = 0
	expect(await sendDayNotificationsEmails(new Date(NOW.getTime() + 15 * 60_000))).toBe(0)
	expect(sentQueries).toHaveLength(1)
})

test("a second sweep the same day sends nothing", async () => {
	const sentQueries = stubSweepRows({ reactionRows: [toReactionRow("roastfan")], hasRowToday: true })
	expect(await sendDayNotificationsEmails(NOW)).toBe(0)
	expect(sendEmail).not.toHaveBeenCalled()

	// the database leaves out a user with a row today, an email's or a quiet day's
	const recipientsQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "users"'))
	expect(recipientsQuery?.text).toContain('not exists (select "user_id" from "notifications_email_sends" "today_sends"')
	expect(recipientsQuery?.text).toContain('"today_sends"."user_id" = "users"."id" and "today_sends"."sent_day" = $')
	expect(recipientsQuery?.values).toContain(TODAY)
})

// a person recorded as quiet yesterday gets what happened since in today's email
test("a quiet day is not an email: the next day's email covers everything after the last one sent", async () => {
	// the last email covered up to three days ago, yesterday was quiet, and a comment came two days ago
	const yesterdayCheckAt = new Date(NOW.getTime() - 24 * 60 * 60_000)
	const sentQueries = stubSweepRows({
		commentRows: [toActivityRow("roastfan", "two days old", 2 * 24 * 60), toActivityRow("latte", "last night", 600)],
		lastActivityEndAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60_000),
		lastQuietCheckAt: yesterdayCheckAt,
	})
	expect(await sendDayNotificationsEmails(NOW)).toBe(1)

	// both comments are after the last email, so the quiet day between them and today hides neither
	const [message] = sendEmail.mock.calls[0] ?? []
	expect(message?.plainTextContent).toContain("two days old")
	expect(message?.plainTextContent).toContain("last night")

	// the recipients read takes the last email's end from the emails alone
	const recipientsQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "users"'))
	expect(recipientsQuery?.text).toContain('filter (where not "notifications_email_sends"."is_quiet")')
	expect(findSendInserts(sentQueries)).toHaveLength(1)
})

// before a first email the day's pass reads a day back, and back to the last quiet day's check if that is older, so
// a reaction that came right after yesterday's check is not lost to a pass that runs a little later today
test("a first email reaches back to the last quiet day's check", async () => {
	// yesterday's check ran ten minutes earlier in the day than today's pass, and a reaction came a minute after it
	const yesterdayCheckAt = new Date(NOW.getTime() - (24 * 60 + 10) * 60_000)
	stubSweepRows({
		reactionRows: [toReactionRow("roastfan", 24 * 60 + 9), toReactionRow("latte", 24 * 60 + 11)],
		lastQuietCheckAt: yesterdayCheckAt,
	})
	expect(await sendDayNotificationsEmails(NOW)).toBe(1)

	// the reaction after the check is mailed, and the one before it, which the check already read, is not
	const [message] = sendEmail.mock.calls[0] ?? []
	expect(message?.plainTextContent).toContain("roastfan reacted")
	expect(message?.plainTextContent).not.toContain("latte reacted")
})

test("a row that another sweep took first sends nothing", async () => {
	stubSweepRows({ reactionRows: [toReactionRow("roastfan")], isDayFree: false })
	expect(await sendDayNotificationsEmails(NOW)).toBe(0)
	expect(sendEmail).not.toHaveBeenCalled()
})

test("an email covers only what happened since the last one", async () => {
	// the last email covered up to two hours ago, and one comment is older than that
	stubSweepRows({
		commentRows: [toActivityRow("roastfan", "old words", 180), toActivityRow("latte", "new words", 30)],
		lastActivityEndAt: new Date(NOW.getTime() - 120 * 60_000),
	})
	expect(await sendDayNotificationsEmails(NOW)).toBe(1)
	const [message] = sendEmail.mock.calls[0] ?? []
	expect(message?.plainTextContent).toContain("new words")
	expect(message?.plainTextContent).not.toContain("old words")
})

test("activity on someone else's Topic needs the Finding or the Topic to be readable, read once for each", async () => {
	// two comments on one Finding and one on another Topic, all mentioning the recipient
	const toOtherTopicRow = (username: string, findingId: string | null, topicId: string): unknown[] => [
		"mentioned-1",
		username,
		"a take",
		toCreatedAt(60),
		topicId,
		"owner-2",
		"public",
		null,
		"Tea",
		findingId,
		"A page",
		null,
		null,
		null,
		null,
		null,
		...NO_TOPIC_POST,
	]
	const mentionRows = [
		toOtherTopicRow("roastfan", "finding-1", "topic-2"),
		toOtherTopicRow("pourover", "finding-1", "topic-2"),
		toOtherTopicRow("cupper", null, "topic-3"),
	]

	// the recipient's mentions
	stubConnectionPool(({ text }) => {
		if (text.includes('from "comment_mentions"')) {
			return mentionRows
		}

		// the recipient's row, then the day's
		if (text.startsWith("select") && text.includes('from "users"')) {
			return [["mentioned-1", "mentioned@example.com", null, null]]
		}
		return text.startsWith('insert into "notifications_email_sends"') ? [["mentioned-1"]] : []
	})

	// the Finding is closed to the recipient, and the Topic is open
	const isTopicFindingVisible = spyOn(findingPermissions, "isTopicFindingVisible").mockResolvedValue(false)
	const isAllowed = spyOn(authorization, "isAllowed").mockResolvedValue(true)

	// only the Topic's comment is mailed, and each visibility is read once
	expect(await sendDayNotificationsEmails(NOW)).toBe(1)
	expect(isTopicFindingVisible).toHaveBeenCalledTimes(1)
	expect(isAllowed).toHaveBeenCalledTimes(1)
	expect(sendEmail.mock.calls[0]?.[0].plainTextContent).toContain("cupper")
	expect(sendEmail.mock.calls[0]?.[0].plainTextContent).not.toContain("roastfan")
})

test("a Podcast Episode published before the recipient's subscription activated stays out of the email", async () => {
	// a mention on each of two Podcast Episodes of an invite Topic the recipient follows
	const toPodcastEpisodeRow = (username: string, podcastEpisodeId: string, publishedAt: Date): unknown[] => [
		"mentioned-1",
		username,
		"a take",
		toCreatedAt(60),
		"topic-2",
		"owner-2",
		"invite",
		null,
		"Tea",
		null,
		null,
		podcastEpisodeId,
		"A podcast episode",
		1,
		1,
		publishedAt,
		...NO_TOPIC_POST,
	]
	const mentionRows = [
		toPodcastEpisodeRow("roastfan", "podcast-episode-old", new Date("2026-01-01T00:00:00Z")),
		toPodcastEpisodeRow("cupper", "podcast-episode-new", new Date("2026-11-01T00:00:00Z")),
	]

	// the recipient's mentions
	stubConnectionPool(({ text }) => {
		if (text.includes('from "comment_mentions"')) {
			return mentionRows
		}

		// the recipient's row, then the day's
		if (text.startsWith("select") && text.includes('from "users"')) {
			return [["mentioned-1", "mentioned@example.com", null, null]]
		}
		return text.startsWith('insert into "notifications_email_sends"') ? [["mentioned-1"]] : []
	})

	// the Topic is open, and the recipient's subscription activated between the two Podcast Episodes
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(quotas, "loadUserAccess").mockResolvedValue({ isAdmin: false } as Awaited<
		ReturnType<typeof quotas.loadUserAccess>
	>)
	spyOn(topicPermissions, "topicSubscriptionStartDate").mockResolvedValue(new Date("2026-06-01T00:00:00Z"))

	// only the later Podcast Episode's mention reaches the email
	expect(await sendDayNotificationsEmails(NOW)).toBe(1)
	const plainTextContent = sendEmail.mock.calls[0]?.[0].plainTextContent
	expect(plainTextContent).toContain("cupper")
	expect(plainTextContent).not.toContain("roastfan")
})

test("a rejected send gives the day back for the next sweep", async () => {
	sendEmail.mockResolvedValue(false)
	const sentQueries = stubSweepRows({ reactionRows: [toReactionRow("roastfan")] })
	expect(await sendDayNotificationsEmails(NOW)).toBe(0)
	const deleteQuery = sentQueries.find((sentQuery) =>
		sentQuery.text.startsWith('delete from "notifications_email_sends"'),
	)
	expect(deleteQuery?.values).toEqual(["owner-1", TODAY])
})

test("a sweep keeps each recipient's latest email row and latest quiet day row, and deletes the older ones", async () => {
	// a quiet day, after the day's row is written
	const sentQueries = stubSweepRows({})
	expect(await sendDayNotificationsEmails(NOW)).toBe(0)
	const insertPlace = sentQueries.findIndex((sentQuery) =>
		sentQuery.text.startsWith('insert into "notifications_email_sends"'),
	)
	const deletePlace = sentQueries.findIndex((sentQuery) =>
		sentQuery.text.startsWith('delete from "notifications_email_sends"'),
	)
	expect(deletePlace).toBeGreaterThan(insertPlace)

	// the delete names the recipient, and only a row that a later row of the same kind follows
	const deleteQuery = sentQueries[deletePlace]
	expect(deleteQuery?.values).toEqual(["owner-1"])
	expect(deleteQuery?.text).toContain('"later_sends"."user_id" = "notifications_email_sends"."user_id"')
	expect(deleteQuery?.text).toContain('"later_sends"."is_quiet" = "notifications_email_sends"."is_quiet"')
	expect(deleteQuery?.text).toContain('"later_sends"."sent_day" > "notifications_email_sends"."sent_day"')
})

test("a render that throws takes no day and fails nothing else", async () => {
	spyOn(notificationsEmail, "renderNotificationsEmail").mockRejectedValue(new Error("render failed"))
	const sentQueries = stubSweepRows({ reactionRows: [toReactionRow("roastfan")] })
	expect(await sendDayNotificationsEmails(NOW)).toBe(0)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "notifications_email_sends"'))).toBe(
		false,
	)
	expect(sendEmail).not.toHaveBeenCalled()
})

test("the sweep step imports no model call", async () => {
	const source = await Bun.file(new URL("./notificationsEmails.ts", import.meta.url)).text()
	expect(source).not.toContain("@carlnotes/models")
})
