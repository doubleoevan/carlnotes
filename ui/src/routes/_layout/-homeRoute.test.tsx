// the homepage as the server renders it, across two requests in one process, with a section's page links, and with a
// closed section still in the html
import { afterAll, beforeAll, expect, test } from "bun:test"
import type { TopicFeed, TopicFeedResponse } from "@shared/contracts"
import { toTopicPath } from "@shared/seo"
import { RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { loadRouter } from "../-loadRouter"

// the fixture topic's id
const TOPIC_ID = "60221dfa-df65-44fa-84d4-fbaf10d48e5b"

// the visitor feed the fake api returns, which each test sets before it renders
let topicFeedResponse: TopicFeedResponse

// the feed topic's id and name
type ToFeedTopicOptions = { id: string; name: string }

// a public topic, as a visitor's feed lists it
function toFeedTopic({ id, name }: ToFeedTopicOptions): TopicFeed {
	return {
		id,
		name,
		prompt: "What is new.",
		tags: [],
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
		subscriberCount: 0,
		teamCount: 0,
		visibility: "public",
		createdAt: "2026-09-01T00:00:00.000Z",
		lastScanAt: null,
		lastScanDurationMs: null,
		monthCostDollars: null,
		scanSummary: null,
		attachments: [],
		sources: [],
		findings: [],
		latestPodcastEpisode: null,
	}
}

// the featured topics of a visitor's feed, and its popular topics if it has any
type ToTopicFeedResponseOptions = { featuredTopics: TopicFeed[]; popularTopics?: TopicFeed[] }

// a visitor's feed with these featured and popular topics
function toTopicFeedResponse({ featuredTopics, popularTopics = [] }: ToTopicFeedResponseOptions): TopicFeedResponse {
	return {
		sections: [
			{ key: "featured", topics: featuredTopics },
			{ key: "popular", topics: popularTopics },
		],
		topicsRemaining: 0,
		topicLimit: 0,
		dailyTopicLimit: 0,
		dailyTopicsRemaining: 0,
	}
}

// the real fetch, restored after the tests
const realFetch = globalThis.fetch

// a fake fetch that serves the feed in place of the api, and a 404 for any other path
function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const requestUrl = input instanceof Request ? input.url : input.toString()
	return Promise.resolve(
		new URL(requestUrl).pathname === "/api/topic-feed"
			? Response.json(topicFeedResponse)
			: Response.json({ error: "not found" }, { status: 404 }),
	)
}

// swap the fake fetch in for these tests, and restore the real fetch after
beforeAll(() => {
	globalThis.fetch = fakeFetch as typeof fetch
})
afterAll(() => {
	globalThis.fetch = realFetch
})

// render the homepage at a path the way the server renders one request
async function renderHomepage(homepagePath = "/"): Promise<string> {
	const { router } = await loadRouter(homepagePath)
	return renderToString(<RouterProvider router={router} />)
}

// every request renders its own feed, so a later visitor never sees the feed an earlier request read
test("each homepage render shows the feed its own request read", async () => {
	topicFeedResponse = toTopicFeedResponse({
		featuredTopics: [toFeedTopic({ id: TOPIC_ID, name: "Espresso machines" })],
	})
	expect(await renderHomepage()).toContain("Espresso machines")

	// a second request in the same process reads a newer feed
	topicFeedResponse = toTopicFeedResponse({ featuredTopics: [toFeedTopic({ id: TOPIC_ID, name: "Raccoon behavior" })] })
	const secondHomepageHtml = await renderHomepage()
	expect(secondHomepageHtml).toContain("Raccoon behavior")
	expect(secondHomepageHtml).not.toContain("Espresso machines")
})

// a page past the last shows the last page, and the first page's link drops the section's search param
test("a featured page past the last shows the last page with links to every page", async () => {
	// twelve featured topics, three pages of five, rendered at page 9
	topicFeedResponse = toTopicFeedResponse({
		featuredTopics: Array.from({ length: 12 }, (_, i) => {
			const topicNumber = String(i + 1).padStart(2, "0")
			return toFeedTopic({ id: `60221dfa-df65-44fa-84d4-fbaf10d48e${topicNumber}`, name: `Topic ${topicNumber}` })
		}),
	})
	const homepageHtml = await renderHomepage("/?featured=9")

	// the last page shows the last two topics
	expect(homepageHtml).toContain("Topic 11")
	expect(homepageHtml).toContain("Topic 12")
	expect(homepageHtml).not.toContain("Topic 10")

	// the section's page links go to the plain homepage url, then page 2, then the current page 3
	const paginationStart = homepageHtml.indexOf('aria-label="Featured topics pages"')
	const paginationHtml = homepageHtml.slice(paginationStart, homepageHtml.indexOf("</nav>", paginationStart))
	expect(paginationHtml).toContain('href="/"')
	expect(paginationHtml).toContain('href="/?featured=2"')
	const currentPageLinkHtml = paginationHtml.match(/<a[^>]*aria-current="page"[^>]*>3<\/a>/)?.[0]
	expect(currentPageLinkHtml).toContain('href="/?featured=3"')
})

// a visitor's closed popular section stays in the html, so a crawler reaches its first page of topics and page links
test("a closed popular section renders its first page and its page links", async () => {
	// one featured topic and seven popular topics, two pages of popular topics
	const popularTopics = Array.from({ length: 7 }, (_, i) => {
		const topicNumber = String(i + 1).padStart(2, "0")
		return toFeedTopic({ id: `60221dfa-df65-44fa-84d4-fbaf10d48f${topicNumber}`, name: `Popular topic ${topicNumber}` })
	})
	topicFeedResponse = toTopicFeedResponse({
		featuredTopics: [toFeedTopic({ id: TOPIC_ID, name: "Espresso machines" })],
		popularTopics,
	})
	const homepageHtml = await renderHomepage()

	// the first page's five popular topics, each linked to its slugged topic page, and the link to page 2
	for (const popularTopic of popularTopics.slice(0, 5)) {
		expect(homepageHtml).toContain(popularTopic.name)
		expect(homepageHtml).toContain(`href="${toTopicPath(popularTopic)}"`)
	}
	expect(homepageHtml).toContain('href="/?popular=2"')

	// the popular section's content is closed for a visitor, whose feed opens on the featured section
	const popularSectionHtml = homepageHtml.slice(homepageHtml.indexOf(">Popular topics<"))
	const popularContentTag = popularSectionHtml.match(/<div[^>]*data-slot="accordion-content"[^>]*>/)?.[0]
	expect(popularContentTag).toContain('data-state="closed"')
})
