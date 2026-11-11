// the Topic Post routes as the server renders them: the head, the body's text, the newest Comment, the discussion's
// closed transcript, the redirect to the current slugs, and the 404 a visitor gets for a draft
import { afterAll, beforeAll, expect, test } from "bun:test"
import type { PageHead } from "@carlnotes/contracts/pageHead"
import { EMPTY_REACTION_SUMMARY } from "@carlnotes/contracts/social"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { loadRouter } from "@/routes/-loadRouter"

// the fixture post's ids and current slugs, and a draft's id, which has no head
const TOPIC_ID = "60221dfa-df65-44fa-84d4-fbaf10d48e5b"
const TOPIC_POST_ID = "9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e"
const DRAFT_ID = "00000000-0000-4000-8000-000000000001"
const TOPIC_POST_PATH = `/topics/${TOPIC_ID}/agents/posts/${TOPIC_POST_ID}/what-agents-shipped`

// the post's page head, as the api returns it
const TOPIC_POST_HEAD = {
	title: "What agents shipped · Agents — CarlNotes",
	cardTitle: "What agents shipped",
	description: "A week of agent releases, sorted by what held up.",
	canonicalUrl: `https://carlnotes.com${TOPIC_POST_PATH}`,
	cardUrl: `https://carlnotes.com${TOPIC_POST_PATH}`,
	imageUrl: `https://carlnotes.com/api/topics/${TOPIC_ID}/preview.png`,
	feedUrl: null,
	isIndexed: true,
	jsonLd: { "@type": "BlogPosting" },
} satisfies PageHead

// the published post, as the api returns it to a visitor, with one Comment on its thread's first page and a
// discussion's recording with its transcript
const TOPIC_POST = {
	id: TOPIC_POST_ID,
	topicId: TOPIC_ID,
	topicName: "Agents",
	title: "What agents shipped",
	author: { userId: "u1", username: "carl", avatarSource: "", avatarVersion: null },
	publishedAt: "2026-11-03T16:00:00.000Z",
	wordCount: 320,
	image: null,
	summary: "A week of agent releases, sorted by what held up.",
	reactionCount: 0,
	path: TOPIC_POST_PATH,
	html: "<html><h1>The short list</h1><p>Three releases held up under real work.</p></html>",
	version: 2,
	editedAt: null,
	isTopicPublic: true,
	reactions: EMPTY_REACTION_SUMMARY,
	commentThread: {
		comments: [
			{
				id: "c1",
				author: { userId: "u2", username: "vienna", avatarSource: "", avatarVersion: null },
				body: "The second one surprised me.",
				mentions: [],
				chapterPosition: null,
				parentCommentId: null,
				isAuthor: false,
				createdAt: "2026-11-03T17:00:00.000Z",
				isEditable: false,
				canDelete: false,
				isSharedWithPodcast: false,
				isAired: false,
				isReported: false,
				reactions: EMPTY_REACTION_SUMMARY,
				replies: [],
				replyCount: 0,
			},
		],
		nextCursor: null,
		weekCommentCount: 1,
		sharedCommentSlots: null,
	},
	isTopicOwner: false,
	isAuthor: false,
	isEditable: false,
	canDelete: false,
	canPublish: false,
	canEditImage: false,
	imageRegenerationQuota: null,
	imageOrigin: null,
	imagePrompt: null,
	discussion: {
		id: "d1",
		durationSeconds: 146,
		publishedAt: "2026-11-03T16:20:00.000Z",
		isRecording: false,
		transcript: [
			{ speakerName: "Carl", text: "Three releases made the short list." },
			{ speakerName: "Vienna", text: "And the second one earned it." },
		],
	},
	discussionRegenerationQuota: null,
	topicImage: null,
} satisfies TopicPostResponse

// serve the published post and its head, and a 404 for the draft and every other path
const realFetch = globalThis.fetch
beforeAll(() => {
	globalThis.fetch = ((input: RequestInfo | URL) => {
		const { pathname } = new URL(input instanceof Request ? input.url : input.toString())
		if (pathname.endsWith(`${TOPIC_POST_ID}/head`)) {
			return Promise.resolve(Response.json(TOPIC_POST_HEAD))
		}
		if (pathname.endsWith(TOPIC_POST_ID)) {
			return Promise.resolve(Response.json(TOPIC_POST))
		}
		return Promise.resolve(Response.json({ error: "not found" }, { status: 404 }))
	}) as typeof fetch
})
afterAll(() => {
	globalThis.fetch = realFetch
})

// a crawler reads the post's own head, its body's text, and the newest Comment, with no script run
test("a public topic's post renders its head, its body, and its thread on the server", async () => {
	const { router } = await loadRouter(TOPIC_POST_PATH)
	const html = renderToString(<RouterProvider router={router} />)

	// the head is the post's own
	expect(html).toContain("<title>What agents shipped · Agents — CarlNotes</title>")
	expect(html).toContain(`<link rel="canonical" href="https://carlnotes.com${TOPIC_POST_PATH}"`)
	expect(html).toContain('<script type="application/ld+json">{"@type":"BlogPosting"}</script>')

	// the title, the author, the body's text, and the Comment are in the html
	expect(html).toMatch(/<h1[^>]*>[\s\S]*?What agents shipped/)
	expect(html).toContain("carl")
	expect(html).toContain("The short list")
	expect(html).toContain("Three releases held up under real work.")
	expect(html).toContain("The second one surprised me.")
})

// a crawler and a browser without JavaScript read the discussion's transcript, which the card's name opens
test("a post's discussion card renders closed on the server, with its transcript in the html", async () => {
	const { router } = await loadRouter(TOPIC_POST_PATH)
	const html = renderToString(<RouterProvider router={router} />)

	// the card's name is the summary of a details element that is not open
	const [detailsTag = ""] =
		html.match(/<details[^>]*>(?=<summary[^>]*><h2[^>]*>.*?Coffee Break Discussion<\/h2>)/) ?? []
	expect(detailsTag).toStartWith("<details")
	expect(detailsTag).not.toMatch(/\sopen\b/)

	// each turn follows its speaker's name, in a box that is hidden until the details element opens
	const [transcriptBox = ""] = html.match(/<div class="[^"]*group-has-\[details\[open\]\][^"]*">.*?<\/div>/) ?? []
	expect(transcriptBox).toMatch(/^<div class="[^"]*\bhidden\b/)
	expect(transcriptBox).toMatch(/<span[^>]*>Carl: <\/span>Three releases made the short list\./)
	expect(transcriptBox).toMatch(/<span[^>]*>Vienna: <\/span>And the second one earned it\./)
})

// the id resolves the post, and the url redirects to the current slugs
test("an id-only path and a stale slug redirect permanently to the post's current path", async () => {
	for (const path of [
		`/topics/${TOPIC_ID}/agents/posts/${TOPIC_POST_ID}`,
		`/topics/${TOPIC_ID}/agents/posts/${TOPIC_POST_ID}/an-earlier-title`,
		`/topics/${TOPIC_ID}/old-topic-name/posts/${TOPIC_POST_ID}/what-agents-shipped`,
	]) {
		const { serverLoadResult } = await loadRouter(path)
		if (serverLoadResult?.type !== "redirect") {
			throw new Error(`${path} did not redirect`)
		}

		// the redirect goes to the current path with a permanent status
		const redirectLocation = serverLoadResult.redirect.headers.get("Location") ?? ""
		expect(new URL(redirectLocation, "http://localhost").pathname).toBe(TOPIC_POST_PATH)
		expect(serverLoadResult.redirect.options.statusCode).toBe(301)
	}
})

// a draft has no head, so a request with no session is answered as for a post that does not exist
test("a draft responds 404 to a visitor", async () => {
	const { serverLoadResult } = await loadRouter(`/topics/${TOPIC_ID}/agents/posts/${DRAFT_ID}`)
	expect(serverLoadResult).toMatchObject({ type: "render", status: 404 })
})
