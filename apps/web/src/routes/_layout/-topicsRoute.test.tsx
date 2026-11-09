// the Topics page as the server renders it, across two requests in one process, with a section's page links, and with a
// closed section still in the html

import { afterAll, beforeAll, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { TopicFeed, TopicFeedResponse } from "@carlnotes/contracts/topics"
import { RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { loadRouter } from "@/routes/-loadRouter"

// the fixture topic's id
const TOPIC_ID = "60221dfa-df65-44fa-84d4-fbaf10d48e5b"

// the visitor feed the fake api returns, which each test sets before it renders
let topicFeedResponse: TopicFeedResponse

// a feed topic with the given id, name, and findings
type ToFeedTopicOptions = { id: string; name: string; findings?: TopicFinding[] }

// a public topic, as a visitor's feed lists it
function toFeedTopic({ id, name, findings = [] }: ToFeedTopicOptions): TopicFeed {
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
		viewerCount: 0,
		teamCount: 0,
		visibility: "public",
		createdAt: "2026-09-01T00:00:00.000Z",
		feedUpdatedAt: "2026-09-01T00:00:00.000Z",
		lastScanAt: null,
		lastScanDurationMs: null,
		monthCostDollars: null,
		scanSummary: null,
		attachments: [],
		sources: [],
		findings,
		latestPodcastEpisode: null,
		image: null,
	}
}

// a topic finding with its ids and title from the number
function toTopicFinding(findingNumber: number): TopicFinding {
	return {
		findingId: `f${findingNumber}`,
		scanId: "s1",
		resourceId: `r${findingNumber}`,
		url: `https://example.com/${findingNumber}`,
		resourceKind: "read",
		title: `Finding ${findingNumber}`,
		source: "example.com",
		faviconPath: null,
		publishedAt: "2026-09-20T00:00:00.000Z",
		fetchedAt: "2026-09-21T00:00:00.000Z",
		viewCount: 0,
		relevanceScore: 0.9,
		relevanceExplanation: "Why Carl kept it.",
		rating: null,
		isConsumed: false,
		isBookmarked: false,
		teamBookmarks: [],
	}
}

// the home topics of a visitor's feed, and its popular topics if it has any
type ToTopicFeedResponseOptions = { homeTopics: TopicFeed[]; popularTopics?: TopicFeed[] }

// a visitor's feed with these home and popular topics
function toTopicFeedResponse({ homeTopics, popularTopics = [] }: ToTopicFeedResponseOptions): TopicFeedResponse {
	return {
		sections: [
			{ key: "home", topics: homeTopics },
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

// render the Topics page at a path the way the server renders one request
async function renderTopicsPage(topicsPagePath = "/topics"): Promise<string> {
	const { router } = await loadRouter(topicsPagePath)
	return renderToString(<RouterProvider router={router} />)
}

// each server render configures its own transport after a browser test resets the shared client
test("a server route loads its feed after the api client was configured for a browser", async () => {
	configureApiClient({ apiBaseUrl: "", showError: console.error })
	topicFeedResponse = toTopicFeedResponse({
		homeTopics: [toFeedTopic({ id: TOPIC_ID, name: "Server-rendered coffee" })],
	})
	expect(await renderTopicsPage()).toContain("Server-rendered coffee")
})

// every request renders its own feed, so a later visitor never sees the feed an earlier request read
test("each Topics page render shows the feed its own request read", async () => {
	topicFeedResponse = toTopicFeedResponse({
		homeTopics: [toFeedTopic({ id: TOPIC_ID, name: "Espresso machines" })],
	})
	expect(await renderTopicsPage()).toContain("Espresso machines")

	// a second request in the same process reads a newer feed
	topicFeedResponse = toTopicFeedResponse({ homeTopics: [toFeedTopic({ id: TOPIC_ID, name: "Raccoon behavior" })] })
	const secondTopicsPageHtml = await renderTopicsPage()
	expect(secondTopicsPageHtml).toContain("Raccoon behavior")
	expect(secondTopicsPageHtml).not.toContain("Espresso machines")
})

// the header's sign-in and sign-up links are nofollow, and the sign-in link still names the page in its next param
test("a visitor's sign-in and sign-up links are nofollow", async () => {
	topicFeedResponse = toTopicFeedResponse({ homeTopics: [] })
	const topicsPageHtml = await renderTopicsPage()
	expect(topicsPageHtml).toMatch(/<a rel="nofollow"[^>]*href="\/login\?next=%2Ftopics"/)
	expect(topicsPageHtml).toMatch(/<a rel="nofollow"[^>]*href="\/signup\?cta=header"/)
})

// a page past the last shows the last page. the topics off that page are in the html, hidden with JavaScript, and
// the first page's link drops the section's search param
test("a home topics page past the last shows the last page with links to every page", async () => {
	// twelve home topics, three pages of five, rendered at page 9
	topicFeedResponse = toTopicFeedResponse({
		homeTopics: Array.from({ length: 12 }, (_, i) => {
			const topicNumber = String(i + 1).padStart(2, "0")
			return toFeedTopic({ id: `60221dfa-df65-44fa-84d4-fbaf10d48e${topicNumber}`, name: `Topic ${topicNumber}` })
		}),
	})
	const topicsPageHtml = await renderTopicsPage("/topics?home=9")

	// the class of a topic's card, the reveal div above its name
	const toTopicViewClass = (name: string): string => {
		const cardStart = topicsPageHtml.lastIndexOf("data-reveal", topicsPageHtml.indexOf(name))
		const classStart = topicsPageHtml.indexOf('class="', cardStart)
		return topicsPageHtml.slice(classStart, topicsPageHtml.indexOf('"', classStart + 7))
	}

	// the last page shows the last two topics, and the ten before them are hidden with JavaScript
	expect(toTopicViewClass("Topic 10")).toContain("scripted:hidden")
	expect(toTopicViewClass("Topic 11")).not.toContain("scripted:hidden")
	expect(toTopicViewClass("Topic 12")).not.toContain("scripted:hidden")

	// the section's page links go to the plain Topics page url, then page 2, then the current page 3
	const paginationStart = topicsPageHtml.indexOf('aria-label="Home topics pages"')
	const paginationHtml = topicsPageHtml.slice(paginationStart, topicsPageHtml.indexOf("</nav>", paginationStart))
	expect(paginationHtml).toContain('href="/topics"')
	expect(paginationHtml).toContain('href="/topics?home=2"')
	const currentPageLinkHtml = paginationHtml.match(/<a[^>]*aria-current="page"[^>]*>3<\/a>/)?.[0]
	expect(currentPageLinkHtml).toContain('href="/topics?home=3"')
})

// a visitor's closed popular section stays in the html, so a crawler reaches its first page of topics and page links
test("a closed popular section renders its first page and its page links", async () => {
	// one home topic and seven popular topics, two pages of popular topics
	const popularTopics = Array.from({ length: 7 }, (_, i) => {
		const topicNumber = String(i + 1).padStart(2, "0")
		return toFeedTopic({ id: `60221dfa-df65-44fa-84d4-fbaf10d48f${topicNumber}`, name: `Popular topic ${topicNumber}` })
	})
	topicFeedResponse = toTopicFeedResponse({
		homeTopics: [toFeedTopic({ id: TOPIC_ID, name: "Espresso machines" })],
		popularTopics,
	})
	const topicsPageHtml = await renderTopicsPage()

	// the first page's five popular topics, each linked to its slugged topic page, and the link to page 2
	for (const popularTopic of popularTopics.slice(0, 5)) {
		expect(topicsPageHtml).toContain(popularTopic.name)
		expect(topicsPageHtml).toContain(`href="${toTopicPath(popularTopic)}"`)
	}
	expect(topicsPageHtml).toContain('href="/topics?popular=2"')

	// the popular section's content is closed for a visitor, whose feed opens on the home topics section
	const popularSectionHtml = topicsPageHtml.slice(topicsPageHtml.indexOf(">Popular topics<"))
	const popularContentTag = popularSectionHtml.match(/<div[^>]*data-slot="accordion-content"[^>]*>/)?.[0]
	expect(popularContentTag).toContain('data-state="closed"')

	// the closed section hides only with JavaScript
	expect(popularContentTag).toContain("scripted:data-[state=closed]:hidden")
})

// a card's expander is a button with JavaScript and a link to the topic's page without it
test("a card's expander is a link to the topic page without JavaScript", async () => {
	// one home topic with seven findings, two more than the five a card shows
	const topicFindings = Array.from({ length: 7 }, (_, index) => toTopicFinding(index + 1))
	topicFeedResponse = toTopicFeedResponse({
		homeTopics: [toFeedTopic({ id: TOPIC_ID, name: "Espresso machines", findings: topicFindings })],
	})
	const topicsPageHtml = await renderTopicsPage()

	// the button shows with JavaScript alone, and the link in its place is hidden with JavaScript
	expect(topicsPageHtml).toMatch(/<button[^>]*class="[^"]*hidden[^"]*scripted:flex[^"]*"[^>]*>.{0,120}\+ 2 more/)
	expect(topicsPageHtml).toMatch(
		new RegExp(
			`<a [^>]*class="[^"]*scripted:hidden[^"]*"[^>]*href="/topics/${TOPIC_ID}/espresso-machines"[^>]*>\\+ 2 more`,
		),
	)
})
