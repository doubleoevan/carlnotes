// the site search's Topic Post reader: what a published Topic Post matches on, the row it returns, that a draft is
// never found, and the topic view rules a visitor, a user, and an admin read under
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { searchTopicPosts } from "./topicPostSearch"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// one Topic Post row in the order the search selects its columns: the Topic Post, its topic, and its author
function toTopicPostRow({
	publishedAt = "2026-10-01T12:00:00Z",
	imageHash = null,
}: {
	publishedAt?: string | null
	imageHash?: string | null
} = {}): unknown[] {
	// the Topic Post's id, title, summary, published time, and image hash, then its topic and its author
	const topicPostColumns = ["topic-post-1", "Orbit, measured", "A summary of the orbit.", publishedAt, imageHash]
	const topicColumns = ["topic-1", "Orbit Watch", "topic-hash"]
	const authorColumns = ["user-2", "vienna", "generated", null]
	return [...topicPostColumns, ...topicColumns, ...authorColumns]
}

// a visitor's Topic Post search for "orbit"
const VISITOR_SEARCH = { userId: null, isAdmin: false, query: "Orbit", limit: 50 }

// the one read the search sends
function toTopicPostRead(sentQueries: SentQuery[]): SentQuery {
	return sentQueries.find((sentQuery) => sentQuery.text.includes('from "topic_posts"')) as SentQuery
}

test("a published Topic Post matches on its title, its summary, and its body text", async () => {
	// one published Topic Post that the read found
	const sentQueries = stubConnectionPool(() => [toTopicPostRow()])
	const topicPostSearchRows = await searchTopicPosts(VISITOR_SEARCH)

	// the read matches the lowercased query against the title, the summary, and the body with its tags taken out
	const topicPostRead = toTopicPostRead(sentQueries)
	expect(topicPostRead.text).toContain('lower("topic_posts"."title") like $')
	expect(topicPostRead.text).toContain('lower("topic_posts"."summary") like $')
	expect(topicPostRead.text).toContain(`lower(regexp_replace("topic_posts"."html", '<[^>]*>', ' ', 'g')) like $`)
	expect(topicPostRead.values).toContain("%orbit%")

	// the row names the Topic Post, its page, its published time, its topic, and its author
	expect(topicPostSearchRows).toEqual([
		{
			kind: "topicPost",
			id: "topic-post-1",
			name: "Orbit, measured",
			path: "/topics/topic-1/orbit-watch/posts/topic-post-1/orbit-measured",
			date: "2026-10-01T12:00:00.000Z",
			count: null,
			// the author, the summary, and the image, then the topic
			topicPost: {
				author: expect.objectContaining({ userId: "user-2", username: "vienna" }),
				summary: "A summary of the orbit.",
				image: expect.objectContaining({ thumbnail: expect.anything() }),
			},
			topic: { id: "topic-1", name: "Orbit Watch" },
		},
	])
})

test("a Topic Post's row shows its own image, and its topic's image until its own is drawn", async () => {
	// a Topic Post with no image of its own shows its topic's
	stubConnectionPool(() => [toTopicPostRow()])
	const [topicImageRow] = await searchTopicPosts(VISITOR_SEARCH)
	expect(topicImageRow?.topicPost.image?.thumbnail.url).toContain("topic-hash")

	// a Topic Post with its own image shows that one
	stubConnectionPool(() => [toTopicPostRow({ imageHash: "topic-post-hash" })])
	const [topicPostImageRow] = await searchTopicPosts(VISITOR_SEARCH)
	expect(topicPostImageRow?.topicPost.image?.thumbnail.url).toContain("topic-post-hash")
	expect(topicPostImageRow?.topicPost.image?.thumbnail.url).toContain("topic-post-1")
})

test("a draft is never found", async () => {
	// the read keeps the published Topic Posts alone, and a row with no published time returns no result
	const sentQueries = stubConnectionPool(() => [toTopicPostRow({ publishedAt: null })])
	expect(await searchTopicPosts(VISITOR_SEARCH)).toEqual([])
	expect(toTopicPostRead(sentQueries).text).toContain('"topic_posts"."published_at" is not null')
})

test("a Topic Post on a private topic is hidden from a reader without access", async () => {
	// a visitor's read keeps the public topics alone, with none of a user's rules
	const visitorQueries = stubConnectionPool()
	await searchTopicPosts(VISITOR_SEARCH)
	const visitorRead = toTopicPostRead(visitorQueries)
	expect(visitorRead.text).toContain('"topics"."visibility" = $')
	expect(visitorRead.text).not.toContain('"topics"."owner_id" = $')

	// a user's read adds the topics their account may open, by their own id
	const userQueries = stubConnectionPool()
	await searchTopicPosts({ ...VISITOR_SEARCH, userId: "user-1" })
	const userRead = toTopicPostRead(userQueries)
	expect(userRead.text).toContain('"topics"."visibility" = $')
	expect(userRead.text).toContain('"topics"."owner_id" = $')
	expect(userRead.values).toContain("user-1")

	// an admin's read has no topic rule
	const adminQueries = stubConnectionPool()
	await searchTopicPosts({ ...VISITOR_SEARCH, userId: "admin-1", isAdmin: true })
	expect(toTopicPostRead(adminQueries).text).not.toContain('"topics"."visibility" = $')
})
