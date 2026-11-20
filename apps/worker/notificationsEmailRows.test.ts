// notifications email activity read tests: what each read leaves out, whose activity it reads, how a mention is
// quoted, and the reads of a Topic Post's author
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as authorization from "@carlnotes/db/authorization"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as email from "@carlnotes/emails/email"
import { sendDayNotificationsEmails } from "./notificationsEmails"
import {
	NO_FINDING_OR_PODCAST_EPISODE,
	NO_TOPIC_POST,
	NOW,
	stubSweepRows,
	TOPIC_COLUMNS,
	TOPIC_POST_AUTHOR_READ,
	toCreatedAt,
	toReactionRow,
} from "./notificationsEmailTestFixtures"

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
