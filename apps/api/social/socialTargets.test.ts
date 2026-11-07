// social target tests: each kind resolves to its Topic, path, and name, a Comment resolves to what it hangs on, a
// post and a missing target resolve to nothing, and a target the user may not open reads the same as a missing one
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { comments } from "@carlnotes/db/schema/social"
import { loadReactionSummaries } from "./reactionRows"
import { toAfterSocialCursorFilter, toCommentPermissions, toSocialCursor } from "./socialRows"
import { toRowCommentTarget, toRowSocialTarget, toSocialTargetValues } from "./socialTargetColumns"
import { loadSocialTarget, resolveSocialTarget } from "./socialTargets"

// a public and a private Topic's gate columns and name, as a social target read selects them
const PUBLIC_TOPIC_ROW = ["topic-1", "owner-1", "public", null, "Coffee Roasting"]
const PRIVATE_TOPIC_ROW = ["topic-2", "owner-1", "private", null, "Private Notes"]

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

test("a Topic resolves to its own page and name", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "topics"') ? [PUBLIC_TOPIC_ROW] : []))
	expect(await loadSocialTarget({ kind: "topic", id: "topic-1" })).toEqual({
		commentTarget: { kind: "topic", id: "topic-1" },
		topic: { id: "topic-1", ownerId: "owner-1", visibility: "public", teamId: null, name: "Coffee Roasting" },
		path: "/topics/topic-1/coffee-roasting",
		label: "Coffee Roasting",
	})
})

test("a Finding resolves to its Topic's page opened on it, named by its page's title", async () => {
	// the Finding's Topic, then its Resource's title and url. the read leaves out a Finding rated thumbs down
	const sentQueries = stubConnectionPool(() => [[...PUBLIC_TOPIC_ROW, "A Good Page", "https://example.org/page"]])
	const resolvedSocialTarget = await loadSocialTarget({ kind: "finding", id: "finding 1" })
	expect(resolvedSocialTarget?.path).toBe("/topics/topic-1/coffee-roasting?finding=finding%201")
	expect(resolvedSocialTarget?.label).toBe("A Good Page")
	expect(sentQueries[0]?.text).toContain(`"findings"."rating" is distinct from 'down'`)
})

test("a published Podcast Episode resolves to its own page, and one with no number resolves to nothing", async () => {
	// a published Podcast Episode's Topic, title, season, and number
	stubConnectionPool(() => [[...PUBLIC_TOPIC_ROW, "Episode One", 2026, 3]])
	const resolvedSocialTarget = await loadSocialTarget({ kind: "podcastEpisode", id: "episode-1" })
	expect(resolvedSocialTarget?.path).toBe("/topics/topic-1/coffee-roasting/episodes/2026/3")
	expect(resolvedSocialTarget?.label).toBe("Episode One")

	// a row with no season and number is not a published one
	stubConnectionPool(() => [[...PUBLIC_TOPIC_ROW, "Episode One", null, null]])
	expect(await loadSocialTarget({ kind: "podcastEpisode", id: "episode-1" })).toBeNull()
})

test("a Comment resolves to what it hangs on, as the reactions' own social target", async () => {
	// the Comment's row on the Topic, then the Topic
	stubConnectionPool(({ text }) => {
		if (text.includes('from "comments"')) {
			return [toTableRow(comments, { id: "comment-1", authorUserId: "user-1", topicId: "topic-1", body: "hi" })]
		}
		return text.includes('from "topics"') ? [PUBLIC_TOPIC_ROW] : []
	})
	const resolvedSocialTarget = await loadSocialTarget({ kind: "comment", id: "comment-1" })
	expect(resolvedSocialTarget).toMatchObject({
		commentTarget: { kind: "topic", id: "topic-1" },
		path: "/topics/topic-1/coffee-roasting",
		label: "Coffee Roasting",
	})

	// a missing Comment resolves to nothing
	stubConnectionPool()
	expect(await loadSocialTarget({ kind: "comment", id: "missing" })).toBeNull()
})

test("a post and a missing target resolve to nothing", async () => {
	const sentQueries = stubConnectionPool()
	expect(await loadSocialTarget({ kind: "post", id: "post-1" })).toBeNull()
	expect(sentQueries).toHaveLength(0)
	expect(await loadSocialTarget({ kind: "topic", id: "missing" })).toBeNull()
})

test("a Topic the user may not open resolves to nothing, like a missing one", async () => {
	// a private Topic, and a user with no role on it and no admin role
	stubConnectionPool(({ text }) => {
		if (text.includes('from "users"')) {
			return [["user", "free", null]]
		}
		return text.includes('from "topics"') ? [PRIVATE_TOPIC_ROW] : []
	})

	// a stranger and a visitor get nothing, and the owner gets the Topic
	expect(await resolveSocialTarget("stranger-1", { kind: "topic", id: "topic-2" })).toBeNull()
	expect(await resolveSocialTarget(null, { kind: "topic", id: "topic-2" })).toBeNull()
	expect(await resolveSocialTarget("owner-1", { kind: "topic", id: "topic-2" })).not.toBeNull()
})

test("a row's one set column names its social target, and a target sets that one column", () => {
	// a comment row sets exactly one of the four
	const noTarget = { findingId: null, podcastEpisodeId: null, topicId: null, postId: null }
	expect(toRowCommentTarget({ ...noTarget, findingId: "f" })).toEqual({ kind: "finding", id: "f" })
	expect(toRowCommentTarget({ ...noTarget, podcastEpisodeId: "e" })).toEqual({ kind: "podcastEpisode", id: "e" })
	expect(toRowCommentTarget({ ...noTarget, topicId: "t" })).toEqual({ kind: "topic", id: "t" })
	expect(toRowCommentTarget({ ...noTarget, postId: "p" })).toEqual({ kind: "post", id: "p" })

	// a reaction row may set the comment's column instead, and a target sets its one column
	expect(toRowSocialTarget({ ...noTarget, commentId: "c" })).toEqual({ kind: "comment", id: "c" })
	expect(toRowSocialTarget({ ...noTarget, topicId: "t", commentId: null })).toEqual({ kind: "topic", id: "t" })
	expect(toSocialTargetValues({ kind: "podcastEpisode", id: "e" })).toEqual({ podcastEpisodeId: "e" })
	expect(toSocialTargetValues({ kind: "comment", id: "c" })).toEqual({ commentId: "c" })
})

test("the summaries of forty Findings and their Topic take the same one read as the summary of one", async () => {
	// a signed-in reader's summaries: each target's count per type, with their own type, in one read
	const oneQueries = stubConnectionPool()
	await loadReactionSummaries({ userId: "user-1", targets: [{ kind: "finding", id: "finding-1" }] })
	const fortyQueries = stubConnectionPool()
	await loadReactionSummaries({
		userId: "user-1",
		targets: [
			{ kind: "topic", id: "topic-1" },
			...Array.from({ length: 40 }, (_unused, index) => ({ kind: "finding" as const, id: `finding-${index}` })),
		],
	})
	expect(oneQueries).toHaveLength(1)
	expect(fortyQueries).toHaveLength(1)
	expect(fortyQueries[0]?.text).toContain('"reactions"."topic_id" in')
	expect(fortyQueries[0]?.text).toContain('"reactions"."finding_id" in')

	// no targets read nothing
	const noQueries = stubConnectionPool()
	expect((await loadReactionSummaries({ userId: "user-1", targets: [] })).size).toBe(0)
	expect(noQueries).toHaveLength(0)
})

test("the summary counts each type and holds the reader's own type", async () => {
	// the rows: the target columns, the type, its newest user, the count, whether the reader chose it, and a user with
	// no name
	const toCountRow = (reactionType: string, count: number, isOwn: boolean): unknown[] => [
		"finding-1",
		null,
		null,
		null,
		null,
		reactionType,
		"user-2",
		count,
		isOwn,
		null,
		null,
		null,
	]
	stubConnectionPool(() => [toCountRow("insightful", 2, true), toCountRow("like", 4, false)])
	const reactionSummaries = await loadReactionSummaries({
		userId: "user-1",
		targets: [{ kind: "finding", id: "finding-1" }],
	})
	expect(reactionSummaries.get("finding:finding-1")).toEqual({
		counts: [
			{ reactionType: "insightful", count: 2, users: [] },
			{ reactionType: "like", count: 4, users: [] },
		],
		ownReactionType: "insightful",
	})
})

test("a reader edits their own comment inside its edit time, and deletes it or any if they moderate", () => {
	// the reader's own comment, their own past the edit time, and another person's
	const ownRow = { authorUserId: "user-1", createdAt: new Date() }
	const oldOwnRow = { authorUserId: "user-1", createdAt: new Date(Date.now() - 16 * 60_000) }
	const otherRow = { authorUserId: "user-2", createdAt: new Date() }
	const reader = { userId: "user-1", canModerate: false, canShare: false }

	// an author edits inside the edit time and always deletes, a moderator deletes anyone's, a visitor is no author
	expect(toCommentPermissions(ownRow, reader)).toEqual({ isAuthor: true, isEditable: true, canDelete: true })
	expect(toCommentPermissions(oldOwnRow, reader)).toEqual({ isAuthor: true, isEditable: false, canDelete: true })
	expect(toCommentPermissions(otherRow, reader)).toEqual({ isAuthor: false, isEditable: false, canDelete: false })
	expect(toCommentPermissions(otherRow, { ...reader, canModerate: true }).canDelete).toBe(true)
	expect(toCommentPermissions(ownRow, { ...reader, userId: null }).isAuthor).toBe(false)
})

test("a cursor names a row's creation time and id, and one that does not parse reads as a first page", () => {
	// an id with an underscore survives the round trip
	const createdAt = new Date("2026-11-05T10:00:00.123Z")
	expect(toSocialCursor({ createdAt, id: "abc_def" })).toBe(`${createdAt.getTime()}_abc_def`)

	// only a cursor that parses filters a read
	const columns = { createdAt: { getSQL: () => "created_at" }, id: { getSQL: () => "id" } } as never
	expect(toAfterSocialCursorFilter(columns, undefined)).toBeUndefined()
	expect(toAfterSocialCursorFilter(columns, "not-a-cursor")).toBeUndefined()
	expect(toAfterSocialCursorFilter(columns, `${"9".repeat(40)}_abc`)).toBeUndefined()
	expect(toAfterSocialCursorFilter(columns, `${createdAt.getTime()}_abc'def`)).toBeUndefined()
	expect(toAfterSocialCursorFilter(columns, `${createdAt.getTime()}_abc_def`)).toBeDefined()
	expect(toAfterSocialCursorFilter(columns, `${createdAt.getTime()}_abc_def`, "oldestFirst")).toBeDefined()
})
