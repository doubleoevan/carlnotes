// notifications email sweep tests: one email a day per recipient, none on a quiet day or before the send hour, what
// an email leaves out, and a rejected send that gives its day back
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as authorization from "@carlnotes/db/authorization"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as findingPermissions from "@carlnotes/db/findingPermissions"
import * as quotas from "@carlnotes/db/quotas"
import * as topicPermissions from "@carlnotes/db/topicPermissions"
import * as email from "@carlnotes/emails/email"
import * as notificationsEmail from "@carlnotes/emails/notifications-email"
import { sendDayNotificationsEmails, sendNotificationsEmails } from "./notificationsEmails"

// the sweep's time, after the send hour, and the day it counts for
const NOW = new Date("2026-11-06T16:00:00Z")
const TODAY = "2026-11-06"

// the Topic every row is on, as an activity read selects it: id, owner, visibility, team, and name
const TOPIC_COLUMNS = ["topic-1", "owner-1", "public", null, "Coffee"]

// no Finding and no Podcast Episode: the Finding's id and title, then the Podcast Episode's id, title, season, number,
// and publish time
const NO_FINDING_OR_PODCAST_EPISODE = [null, null, null, null, null, null, null]

// no Topic Post: its id and title, which every row ends with
const NO_TOPIC_POST = [null, null]

// the time a row was created, some minutes before the sweep
function toCreatedAt(minutesAgo: number): Date {
	return new Date(NOW.getTime() - minutesAgo * 60_000)
}

// an activity row by one author an hour ago: recipient, username, a reaction's type or a comment's body, time, then the
// target columns
function toActivityRow(username: string, typeOrBody: string, minutesAgo = 60): unknown[] {
	return [
		"owner-1",
		username,
		typeOrBody,
		toCreatedAt(minutesAgo),
		...TOPIC_COLUMNS,
		...NO_FINDING_OR_PODCAST_EPISODE,
		...NO_TOPIC_POST,
	]
}

// a reaction row by one author
function toReactionRow(username: string, minutesAgo = 60): unknown[] {
	return toActivityRow(username, "insightful", minutesAgo)
}

// what marks the reads that go to a Topic Post's author: the recipients are matched against the post's author
const TOPIC_POST_AUTHOR_READ = '"topic_posts"."author_user_id" in'

// what the stubbed connection pool returns: the reactions on the owner's things, the comments on them, the recipient's last
// email, and whether the day's row is free to take
type SweepRows = {
	reactionRows?: unknown[][]
	commentRows?: unknown[][]
	lastActivityEndAt?: Date | null
	lastSentDay?: string | null
	isDayFree?: boolean
}

// a connection pool that returns the given rows to the sweep's reads, with the mention, comment reaction, and reply reads empty
function stubSweepRows({
	reactionRows = [],
	commentRows = [],
	lastActivityEndAt = null,
	lastSentDay = null,
	isDayFree = true,
}: SweepRows): SentQuery[] {
	return stubConnectionPool(({ text }) => {
		// a reaction to a comment and a reply join the comment they answer, and a Topic Post's author has no post here
		if (text.includes('"target_comments"') || text.includes(TOPIC_POST_AUTHOR_READ)) {
			return []
		}

		// the reactions and the comments on the owner's things
		if (text.includes('from "reactions"')) {
			return reactionRows
		}
		if (text.includes('from "comments"')) {
			return commentRows
		}

		// the recipient's address, the end of their last email's time, and the day it went out
		if (text.includes('from "users"')) {
			return [["owner-1", "owner@example.com", lastActivityEndAt, lastSentDay]]
		}
		return text.startsWith('insert into "notifications_email_sends"') && isDayFree ? [["owner-1"]] : []
	})
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

test("a quiet day sends nothing and writes nothing", async () => {
	const sentQueries = stubSweepRows({})
	expect(await sendDayNotificationsEmails(NOW)).toBe(0)
	expect(sendEmail).not.toHaveBeenCalled()
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("insert"))).toBe(false)
})

test("a second sweep the same day sends nothing", async () => {
	stubSweepRows({ reactionRows: [toReactionRow("roastfan")], lastSentDay: TODAY })
	expect(await sendDayNotificationsEmails(NOW)).toBe(0)
	expect(sendEmail).not.toHaveBeenCalled()
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
		lastSentDay: "2026-11-05",
	})
	expect(await sendDayNotificationsEmails(NOW)).toBe(1)
	const [message] = sendEmail.mock.calls[0] ?? []
	expect(message?.plainTextContent).toContain("new words")
	expect(message?.plainTextContent).not.toContain("old words")
})

test("every activity read leaves out an author in a user block with the recipient", async () => {
	const sentQueries = stubSweepRows({})
	await sendDayNotificationsEmails(NOW)

	// each of the seven reads holds the user block, which the database applies in both directions
	const activityReads = sentQueries.filter(({ text }) => text.includes('"authors"'))
	expect(activityReads).toHaveLength(7)
	for (const { text } of activityReads) {
		expect(text).toContain('from "user_blocks"')
	}
})

test("the reads leave out a user whose switch is off and an author under an admin block", async () => {
	const sentQueries = stubSweepRows({ reactionRows: [toReactionRow("roastfan")] })
	await sendDayNotificationsEmails(NOW)

	// the recipients read keeps the switch, and the reactions read drops a blocked author and the owner's own
	const recipientsQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "users"'))
	expect(recipientsQuery?.text).toContain('"users"."is_notifications_email_enabled" = $')
	const reactionsQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "reactions"'))
	expect(reactionsQuery?.text).toContain('"authors"."admin_blocked_at" is null')
	expect(reactionsQuery?.text).toContain('"reactions"."user_id" <> "topics"."owner_id"')
})

test("the sweep reads only the recipients' activity, and nothing with no recipient", async () => {
	const sentQueries = stubSweepRows({ reactionRows: [toReactionRow("roastfan")] })
	await sendDayNotificationsEmails(NOW)
	const reactionsQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "reactions"'))
	expect(reactionsQuery?.text).toContain('"topics"."owner_id" in')
	expect(reactionsQuery?.values).toContain("owner-1")
	expect(sentQueries.find((sentQuery) => sentQuery.text.includes('from "users"'))?.text).not.toContain(
		'"users"."id" in',
	)

	// nobody left to mail reads no activity
	const quietQueries = stubConnectionPool(() => [])
	expect(await sendDayNotificationsEmails(NOW)).toBe(0)
	expect(quietQueries).toHaveLength(1)
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

test("a mention quotes its Comment's first line alone", async () => {
	// a three line Comment on a Topic that mentions the recipient
	const mentionRow = [
		"mentioned-1",
		"cupper",
		"the first line\nthe second line\nthe third line",
		toCreatedAt(60),
		"topic-3",
		"owner-2",
		"public",
		null,
		"Tea",
		...NO_FINDING_OR_PODCAST_EPISODE,
		...NO_TOPIC_POST,
	]

	// the recipient's mention, their row, and the day's
	stubConnectionPool(({ text }) => {
		if (text.includes('from "comment_mentions"')) {
			return [mentionRow]
		}
		// the recipient's row, then the day's
		if (text.startsWith("select") && text.includes('from "users"')) {
			return [["mentioned-1", "mentioned@example.com", null, null]]
		}
		return text.startsWith('insert into "notifications_email_sends"') ? [["mentioned-1"]] : []
	})
	spyOn(authorization, "isAllowed").mockResolvedValue(true)

	// the email holds the first line and neither of the other two
	expect(await sendDayNotificationsEmails(NOW)).toBe(1)
	const { plainTextContent } = sendEmail.mock.calls[0]?.[0] ?? {}
	expect(plainTextContent).toContain("the first line")
	expect(plainTextContent).not.toContain("the second line")
	expect(plainTextContent).not.toContain("the third line")
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

// a Comment on a member's Topic Post, as the read for the post's author selects it
function toTopicPostCommentRow(recipientUserId: string): unknown[] {
	return [
		recipientUserId,
		"roastfan",
		"the pancake part is right",
		toCreatedAt(60),
		...TOPIC_COLUMNS,
		...NO_FINDING_OR_PODCAST_EPISODE,
		"post-1",
		"Dialing in",
	]
}

test("a Comment on a member's Topic Post reaches the member, named by the post's title with its page's link", async () => {
	// the member wrote a post on owner-1's Topic, and a follower commented on it
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "comments"') && text.includes(TOPIC_POST_AUTHOR_READ)) {
			return [toTopicPostCommentRow("member-1")]
		}
		// the member's row, then the day's
		if (text.startsWith("select") && text.includes('from "users"')) {
			return [["member-1", "member@example.com", null, null]]
		}
		return text.startsWith('insert into "notifications_email_sends"') ? [["member-1"]] : []
	})
	// the topic is open to the member
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	expect(await sendDayNotificationsEmails(NOW)).toBe(1)

	// the email quotes the Comment under the post's title, and links to the post's page
	const [message] = sendEmail.mock.calls[0] ?? []
	expect(message?.to).toBe("member@example.com")
	expect(message?.plainTextContent).toContain("roastfan left a hot take on Dialing in")
	expect(message?.plainTextContent).toContain("the pancake part is right")
	expect(message?.plainTextContent).toContain("/topics/topic-1/coffee/posts/post-1/dialing-in")

	// the read for a post's author leaves out a post whose author owns the Topic, who already reads it as the owner
	const topicPostAuthorQueries = sentQueries.filter((sentQuery) => sentQuery.text.includes(TOPIC_POST_AUTHOR_READ))
	expect(topicPostAuthorQueries).toHaveLength(2)
	for (const topicPostAuthorQuery of topicPostAuthorQueries) {
		expect(topicPostAuthorQuery.text).toContain('"topic_posts"."author_user_id" <> "topics"."owner_id"')
	}
})

test("an owner who wrote the Topic Post gets its Comment once, under the post's title", async () => {
	// the owner's own read holds the Comment, and the read for a post's author holds nothing for them
	stubSweepRows({ commentRows: [toTopicPostCommentRow("owner-1")] })
	expect(await sendDayNotificationsEmails(NOW)).toBe(1)
	const { plainTextContent = "", subject } = sendEmail.mock.calls[0]?.[0] ?? {}
	expect(subject).toBe("Carl left you a note: 1 hot take")
	expect(plainTextContent.split("roastfan left a hot take on Dialing in")).toHaveLength(2)
})

test("a mention and a reply stay out of the reads of a Topic Post's author, who already reads them as Comments", async () => {
	const sentQueries = stubSweepRows({})
	await sendDayNotificationsEmails(NOW)
	const mentionQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "comment_mentions"'))
	const replyQuery = sentQueries.find(
		(sentQuery) => sentQuery.text.includes('from "comments"') && sentQuery.text.includes('"target_comments"'),
	)
	expect(mentionQuery?.text).toContain('"comment_mentions"."mentioned_user_id" <> "topic_posts"."author_user_id"')
	expect(replyQuery?.text).toContain('"target_comments"."author_user_id" <> "topic_posts"."author_user_id"')
})
