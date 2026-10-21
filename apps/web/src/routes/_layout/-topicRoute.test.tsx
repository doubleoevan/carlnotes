// the topic routes as the server renders them, with the head, the findings, the 404, the slug redirects, an invite
// topic's noindex, and an unreachable api
import { afterAll, beforeAll, expect, test } from "bun:test"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PageHead } from "@carlnotes/contracts/pageHead"
import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { SITE_TITLE } from "@carlnotes/contracts/seo"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { toPodcastEpisodeSummaryFixture } from "@/components/podcast/podcastEpisodeTestFixtures"
import type { RelatedTopic } from "@/components/topic/RelatedTopicsSection"
import { loadRouter } from "@/routes/-loadRouter"

// the fixture topic's id and current slug, the invite topic's id and slug, and an id the api does not have
const TOPIC_ID = "60221dfa-df65-44fa-84d4-fbaf10d48e5b"
const TOPIC_SLUG = "agents"
const INVITE_TOPIC_ID = "7c1e4b2a-3d5f-4e6a-9b8c-0d1e2f3a4b5c"
const INVITE_TOPIC_SLUG = "night-shift"
const MISSING_TOPIC_ID = "00000000-0000-4000-8000-000000000000"

// the topic's page head, as the api returns it
const TOPIC_HEAD = {
	title: "Agents — CarlNotes",
	cardTitle: "Agents",
	description: "What agents are shipping this week.",
	canonicalUrl: `https://carlnotes.com/topics/${TOPIC_ID}/${TOPIC_SLUG}`,
	cardUrl: `https://carlnotes.com/topics/${TOPIC_ID}/${TOPIC_SLUG}`,
	imageUrl: `https://carlnotes.com/api/topics/${TOPIC_ID}/preview.png`,
	feedUrl: `https://carlnotes.com/topics/${TOPIC_ID}/feed.xml`,
	isIndexed: true,
	jsonLd: { "@type": "CreativeWork" },
} satisfies PageHead

// the invite topic's page head, as the api returns it. an invite topic has a card but no canonical url or feed
const INVITE_TOPIC_HEAD = {
	title: "Night shift — CarlNotes",
	cardTitle: "Night shift",
	description: "What the night shift reads.",
	canonicalUrl: null,
	cardUrl: `https://carlnotes.com/topics/${INVITE_TOPIC_ID}/${INVITE_TOPIC_SLUG}`,
	imageUrl: `https://carlnotes.com/api/topics/${INVITE_TOPIC_ID}/preview.png`,
	feedUrl: null,
	isIndexed: false,
	jsonLd: null,
} satisfies PageHead

// the topic's one finding, as the api returns it
const FINDING = {
	findingId: "f1",
	scanId: "s1",
	resourceId: "r1",
	url: "https://example.com/agents",
	resourceKind: "read",
	title: "Agents are shipping",
	source: "example.com",
	faviconPath: null,
	publishedAt: "2026-09-20T00:00:00.000Z",
	fetchedAt: "2026-09-21T00:00:00.000Z",
	viewCount: 3,
	relevanceScore: 0.9,
	relevanceExplanation: "A weekly roundup of agent releases.",
	rating: null,
	isConsumed: false,
	isBookmarked: false,
	teamBookmarks: [],
	engagement: null,
} satisfies TopicFinding

// the public topic, as the api returns it to a visitor
const TOPIC = {
	id: TOPIC_ID,
	name: "Agents",
	prompt: "Agent releases and what they can do.",
	tags: ["ai"],
	frequency: "daily",
	scheduledTime: "07:00",
	scheduledDayOfWeek: "monday",
	maxTopicFindings: 10,
	owner: { userId: "u1", username: "carl", avatarSource: "", avatarVersion: null },
	isTopicOwner: false,
	newCount: 0,
	isOnTeam: false,
	isTeamMember: false,
	chatMentions: [],
	teamLink: null,
	canRate: false,
	isSubscribed: false,
	subscriberCount: 2,
	teamCount: 0,
	visibility: "public",
	createdAt: "2026-09-01T00:00:00.000Z",
	lastScanAt: "2026-09-21T00:00:00.000Z",
	lastScanDurationMs: 1000,
	monthCostDollars: null,
	scanSummary: "What agents are shipping this week.",
	attachments: [],
	sources: [],
	findings: [FINDING],
	scans: [],
	invites: [],
	manualScansRemaining: null,
	manualScanLimit: null,
	isManualScanPaused: false,
	isSpendExhausted: false,
	canEdit: false,
	team: null,
	hasRequestedToJoin: false,
	roomTeams: [],
	isDailyFrequencyPaused: false,
	featureOrder: null,
	featuredTopics: null,
	relatedTopics: [],
	podcast: null,
	latestPodcastEpisode: null,
} satisfies TopicResponse

// the real fetch, restored after the tests
const realFetch = globalThis.fetch

// the head and the topic a fake fetch serves for the fixture topic's id
type ToFakeFetchOptions = { topicHead: PageHead; topic: TopicResponse }

// a fake fetch that serves this head and topic, and the invite topic's fixtures, in place of the api
function toFakeFetch({ topicHead, topic }: ToFakeFetchOptions): typeof fetch {
	return ((input: RequestInfo | URL) => {
		// read the path the client requested
		const requestUrl = input instanceof Request ? input.url : input.toString()
		const { pathname } = new URL(requestUrl)

		// serve the topic's head and the topic
		if (pathname.endsWith(`${TOPIC_ID}/head`)) {
			return Promise.resolve(Response.json(topicHead))
		}
		if (pathname.endsWith(TOPIC_ID)) {
			return Promise.resolve(Response.json(topic))
		}

		// serve the invite topic's head, the gate a visitor gets in place of the invite topic, or a 404 for any other path
		if (pathname.endsWith(`${INVITE_TOPIC_ID}/head`)) {
			return Promise.resolve(Response.json(INVITE_TOPIC_HEAD))
		}
		if (pathname.endsWith(INVITE_TOPIC_ID)) {
			return Promise.resolve(
				Response.json({ error: "forbidden", gatedVisibility: "invite", topicName: "Night shift" }, { status: 403 }),
			)
		}
		return Promise.resolve(Response.json({ error: "not found" }, { status: 404 }))
	}) as typeof fetch
}

// the fake fetch that serves the fixture topic's own head and topic
const fakeFetch = toFakeFetch({ topicHead: TOPIC_HEAD, topic: TOPIC })

// swap the fake fetch in for these tests, and restore the real fetch after
beforeAll(() => {
	globalThis.fetch = fakeFetch
})
afterAll(() => {
	globalThis.fetch = realFetch
})

// render the fixture topic's page on the server with this head and topic in place of the fixture topic's own
async function renderTopicPage({ topicHead, topic }: ToFakeFetchOptions): Promise<string> {
	// serve this head and topic for the render, and the fixture topic's own again after
	globalThis.fetch = toFakeFetch({ topicHead, topic })
	try {
		const { router } = await loadRouter(`/topics/${TOPIC_ID}/${TOPIC_SLUG}`)
		return renderToString(<RouterProvider router={router} />)
	} finally {
		globalThis.fetch = fakeFetch
	}
}

// a crawler reads the topic's own title, description, card, structured data, heading, and finding link, with no
// script run
test("the public topic route renders its head and its findings on the server", async () => {
	const { router } = await loadRouter(`/topics/${TOPIC_ID}/${TOPIC_SLUG}`)
	const html = renderToString(<RouterProvider router={router} />)

	expect(html).toContain("<title>Agents — CarlNotes</title>")
	expect(html).toContain(`<link rel="canonical" href="https://carlnotes.com/topics/${TOPIC_ID}/${TOPIC_SLUG}"`)
	expect(html).toContain('content="What agents are shipping this week."')
	expect(html).not.toContain("Carl keeps up with your topics")
	expect(html).toMatch(/<h1[^>]*>[\s\S]*?Agents/)
	expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com\/agents"[^>]*rel="noopener ugc"/)
	expect(html).toContain("A weekly roundup of agent releases.")
	expect(html).toContain(
		`<link rel="alternate" type="application/rss+xml" title="Agents" href="https://carlnotes.com/topics/${TOPIC_ID}/feed.xml"`,
	)

	// the share card is the topic's own, with its preview image in place of the site-wide one
	expect(html).toContain('<meta property="og:title" content="Agents"')
	expect(html).toContain(`<meta property="og:image" content="https://carlnotes.com/api/topics/${TOPIC_ID}/preview.png"`)
	expect(html).not.toContain("opengraph-image.png")
	expect(html).toContain('<meta name="twitter:card" content="summary_large_image"')
	expect(html).toContain('<script type="application/ld+json">{"@type":"CreativeWork"}</script>')
})

// a long scan note renders whole on the server with no Read more
test("a long scan note renders whole on the server with no Read more", async () => {
	const longNote = Array.from({ length: 80 }, (_, index) => `Sentence ${index + 1} of the recap.`).join(" ")
	const html = await renderTopicPage({ topicHead: TOPIC_HEAD, topic: { ...TOPIC, scanSummary: longNote } })
	expect(html).toContain("Sentence 80 of the recap.")
	expect(html).not.toContain("Read more")
})

// a related topic, with its latest podcast episode or none
function toRelatedTopic(
	relatedTopicNumber: number,
	latestPodcastEpisode: PodcastEpisodeSummary | null = null,
): RelatedTopic {
	return { id: `related-${relatedTopicNumber}`, name: `Related topic ${relatedTopicNumber}`, latestPodcastEpisode }
}

// a published podcast episode of a related topic, for its play button
const RELATED_PODCAST_EPISODE = toPodcastEpisodeSummaryFixture({
	id: "related-episode-1",
	pagePath: "/topics/related-1/related-topic-1/episodes/2026/7",
})

// the related topics table renders on the server, each name linked, with a play button only beside an episode
test("related topics render on the server, with a play button only for a topic with an episode", async () => {
	const relatedTopics = [toRelatedTopic(1, RELATED_PODCAST_EPISODE), toRelatedTopic(2), toRelatedTopic(3)]
	const html = await renderTopicPage({ topicHead: TOPIC_HEAD, topic: { ...TOPIC, relatedTopics } })

	// the table, each topic's linked name, and one play button
	expect(html).toContain("Similar topics")
	for (const relatedTopic of relatedTopics) {
		expect(html).toMatch(new RegExp(`<a [^>]*href="/topics/${relatedTopic.id}/[^"]*"[^>]*>${relatedTopic.name}</a>`))
	}
	expect(html.match(/aria-label="Play episode 7"/g)).toHaveLength(1)
})

// sixty related topics put fifty rows in the html, five shown once JavaScript runs
test("sixty related topics render fifty rows, five visible with JavaScript", async () => {
	const relatedTopics = Array.from({ length: 60 }, (_, i) => toRelatedTopic(i + 1))
	const html = await renderTopicPage({ topicHead: TOPIC_HEAD, topic: { ...TOPIC, relatedTopics } })

	// the fiftieth topic is linked and the fifty-first is left out, and the sixth row is hidden with JavaScript
	expect(html).toContain(">Related topic 50</a>")
	expect(html).not.toContain(">Related topic 51</a>")
	expect(html).toMatch(/<tr class="[^"]*scripted:hidden[^"]*"><td[^>]*>[\s\S]*?>Related topic 6<\/a>/)
	expect(html).not.toMatch(/<tr class="[^"]*scripted:hidden[^"]*"><td[^>]*>(?:(?!<\/tr>)[\s\S])*?>Related topic 5<\/a>/)
})

// a topic page with no related topics has no Similar topics section
test("a topic with no related topics renders no Similar topics section", async () => {
	const html = await renderTopicPage({ topicHead: TOPIC_HEAD, topic: TOPIC })
	expect(html).not.toContain("Similar topics")
})

// markup in the head's title, card title, and structured data renders escaped, so it opens no script tag
test("markup in a topic head's title and structured data renders escaped", async () => {
	// end the title, the card title, and the structured data's name with markup that opens a script tag
	const markupText = '"><script>alert(1)</script>'
	const html = await renderTopicPage({
		topicHead: {
			...TOPIC_HEAD,
			title: `Agents${markupText}`,
			cardTitle: `Agents${markupText}`,
			jsonLd: { "@type": "CreativeWork", name: `Agents${markupText}` },
		},
		topic: TOPIC,
	})

	expect(html).not.toContain("<script>alert")
	expect(html).toContain("<title>Agents&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>")
	expect(html).toContain("\\u003cscript>alert(1)\\u003c/script>")
})

// a scan with an empty recap still lists every finding, each linked as user content with its relevance explanation
test("a public topic with an empty recap renders every finding on the server", async () => {
	// seven findings, each with its own url and relevance explanation
	const topicFindings = Array.from({ length: 7 }, (_, i) => ({
		...FINDING,
		findingId: `f${i + 1}`,
		resourceId: `r${i + 1}`,
		url: `https://example.com/agents/${i + 1}`,
		title: `Agent release ${i + 1}`,
		relevanceExplanation: `Release ${i + 1} ships a new agent.`,
	}))
	const html = await renderTopicPage({
		topicHead: TOPIC_HEAD,
		topic: { ...TOPIC, scanSummary: "", findings: topicFindings },
	})

	// check every finding's link and relevance explanation
	for (const topicFinding of topicFindings) {
		const escapedFindingUrl = topicFinding.url.replaceAll(".", "\\.")
		expect(html).toMatch(new RegExp(`<a [^>]*href="${escapedFindingUrl}"[^>]*rel="noopener ugc"`))
		expect(html).toContain(topicFinding.relevanceExplanation)
	}
})

// the route responds 404 for a topic the api does not have
test("a missing topic responds 404", async () => {
	const { serverLoadResult } = await loadRouter(`/topics/${MISSING_TOPIC_ID}`)
	expect(serverLoadResult).toMatchObject({ type: "render", status: 404 })
})

// the id resolves the topic, and the url redirects to the current slug
test("an id alone and a stale slug both redirect to the current slug", async () => {
	for (const path of [`/topics/${TOPIC_ID}`, `/topics/${TOPIC_ID}/old-name`]) {
		const { serverLoadResult } = await loadRouter(path)
		if (serverLoadResult?.type !== "redirect") {
			throw new Error(`${path} did not redirect`)
		}

		// check the redirect goes to the current slug with a permanent status
		const redirectLocation = serverLoadResult.redirect.headers.get("Location") ?? ""
		const redirectPath = new URL(redirectLocation, "http://localhost").pathname
		expect(redirectPath).toBe(`/topics/${TOPIC_ID}/${TOPIC_SLUG}`)
		expect(serverLoadResult.redirect.options.statusCode).toBe(301)
	}
})

// an invite topic renders its card with noindex, and no canonical url or feed
test("an invite topic renders its head with noindex", async () => {
	const { router, serverLoadResult } = await loadRouter(`/topics/${INVITE_TOPIC_ID}/${INVITE_TOPIC_SLUG}`)
	const html = renderToString(<RouterProvider router={router} />)

	expect(serverLoadResult).toMatchObject({ type: "render", status: 200 })
	expect(html).toContain("<title>Night shift — CarlNotes</title>")
	expect(html).toContain('<meta name="robots" content="noindex, nofollow"')
	expect(html).not.toContain('rel="canonical"')
	expect(html).not.toContain(`${INVITE_TOPIC_ID}/feed.xml`)
})

// the route renders the topic page with the site-wide head, and no 404, if the api cannot be reached
test("an unreachable api renders the topic page with the site-wide head", async () => {
	// reject every api read in this test, the way a fetch to a down api rejects
	globalThis.fetch = (() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch
	try {
		const { router, serverLoadResult } = await loadRouter(`/topics/${TOPIC_ID}/${TOPIC_SLUG}`)
		const html = renderToString(<RouterProvider router={router} />)

		expect(serverLoadResult).toMatchObject({ type: "render", status: 200 })
		expect(html).toContain(`<title>${SITE_TITLE}</title>`)
	} finally {
		globalThis.fetch = fakeFetch
	}
})
