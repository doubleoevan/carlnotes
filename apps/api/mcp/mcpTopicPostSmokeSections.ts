// the mcp smoke's sections for read_news, read_topic_posts, and read_topic_post: a visitor's and a user's calls on
// /mcp and on the topic-bound route, over a published Topic Post and a draft seeded on the smoke's public topic

import { db } from "@carlnotes/db"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { check, ownerId, routePaths, runId, toClient, topicId, toResultJson } from "./mcpSmokeFixtures"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { toResultText } from "./toolTestFixtures"

// the seeded published Topic Post and draft, which the owner's delete removes with the topic
const publishedTopicPostId = `${runId}-topic-post`
const draftTopicPostId = `${runId}-topic-post-draft`
const publishedTopicPostTitle = `${runId} published post`
const publishedTopicPostBody = `The body of the post that ${runId} published.`

// the sdk client of one route
type SmokeClient = ReturnType<typeof toClient>["client"]

// what read_topic_posts returns, and what read_topic_post adds to one post
type TopicPostsResult = { items: { id: string; title: string; url: string }[] }
type TopicPostResult = { id: string; body: string; isBodyCut: boolean; hasDiscussion: boolean }

// what read_news returns
type NewsResult = {
	window: string
	mentions: unknown[]
	newsEvents: { kind: string; title: string | null }[]
	total: number
}

/** Seeds a published Topic Post and a draft by the owner on the smoke's public topic. */
export async function seedTopicPosts(): Promise<void> {
	await db.insert(topicPosts).values([
		{
			id: publishedTopicPostId,
			topicId,
			authorUserId: ownerId,
			title: publishedTopicPostTitle,
			html: `<p>${publishedTopicPostBody}</p>`,
			wordCount: 9,
			publishedAt: new Date(),
		},
		{ id: draftTopicPostId, topicId, authorUserId: ownerId, title: `${runId} draft` },
	])
}

/** Checks a visitor's calls of the three tools on both routes: no news without an account, and the public posts. */
export async function checkVisitorNewsAndTopicPostTools(): Promise<void> {
	for (const routePath of routePaths) {
		const { client, transport } = toClient(routePath)
		try {
			// a visitor has no news, and reads a public topic's published posts
			await client.connect(transport)
			const newsResult = await client.callTool({ name: "read_news", arguments: {} })
			check(
				`${routePath}: read_news returns the connect text to a visitor`,
				toResultText(newsResult) === CONNECT_ACCOUNT_TEXT,
			)
			await checkTopicPostReads(client, `${routePath} visitor`, routePath)
		} finally {
			// release the sdk transport after each route
			await client.close()
		}
	}
}

/** Checks a user's calls of the three tools on both routes: their own news, the posts, and their own draft. */
export async function checkUserNewsAndTopicPostTools(accessToken: string): Promise<void> {
	for (const routePath of routePaths) {
		const { client, transport } = toClient(routePath, accessToken)
		try {
			// the owner's hour of news holds the post they just published, under its fenced title
			await client.connect(transport)
			const newsResult = await client.callTool({ name: "read_news", arguments: { window: "hour" } })
			const news = toResultJson<NewsResult>(newsResult)
			const hasPublishedTopicPostEvent = news.newsEvents.some(
				(newsEvent) => newsEvent.kind === "topicPost" && newsEvent.title?.includes(publishedTopicPostTitle),
			)
			check(
				`${routePath}: read_news returns the user's hour with the published post and no error`,
				!newsResult.isError && news.window === "hour" && Array.isArray(news.mentions) && hasPublishedTopicPostEvent,
				toResultText(newsResult),
			)

			// a cursor that no window returned is rejected
			const badCursorResult = await client.callTool({ name: "read_news", arguments: { cursor: "not-a-cursor" } })
			check(`${routePath}: read_news rejects a cursor it did not return`, badCursorResult.isError === true)
			await checkTopicPostReads(client, `${routePath} user`, routePath)
		} finally {
			// release the sdk transport after each route
			await client.close()
		}
	}
}

// read the topic's posts and then one post and the draft. the bound route reads its topic with no argument
async function checkTopicPostReads(client: SmokeClient, label: string, routePath: string): Promise<void> {
	// the published post is listed with its link, and the draft is not
	const topicPostsResult = await client.callTool({
		name: "read_topic_posts",
		arguments: routePath === "/mcp" ? { topic_id: topicId } : {},
	})
	const listedTopicPosts = toResultJson<TopicPostsResult>(topicPostsResult).items ?? []
	const listedTopicPost = listedTopicPosts.find((topicPost) => topicPost.id === publishedTopicPostId)
	check(
		`${label}: read_topic_posts lists the published post with its fenced title and url, and no draft`,
		Boolean(listedTopicPost?.title.includes(publishedTopicPostTitle) && listedTopicPost.url.includes("/posts/")) &&
			!listedTopicPosts.some((topicPost) => topicPost.id === draftTopicPostId),
		toResultText(topicPostsResult),
	)

	// the published post reads with its whole body and no discussion
	const topicPostResult = await client.callTool({
		name: "read_topic_post",
		arguments: { topic_post_id: publishedTopicPostId },
	})
	const topicPost = toResultJson<TopicPostResult>(topicPostResult)
	check(
		`${label}: read_topic_post returns the post's body`,
		!topicPostResult.isError &&
			topicPost.body.includes(publishedTopicPostBody) &&
			!topicPost.isBodyCut &&
			!topicPost.hasDiscussion,
		toResultText(topicPostResult),
	)

	// a draft reads as a post that does not exist, for its author too
	const draftResult = await client.callTool({ name: "read_topic_post", arguments: { topic_post_id: draftTopicPostId } })
	check(
		`${label}: read_topic_post rejects a draft`,
		draftResult.isError === true && !toResultText(draftResult).includes(runId),
		toResultText(draftResult),
	)
}
