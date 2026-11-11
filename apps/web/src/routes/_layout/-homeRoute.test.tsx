// the home page as the server renders it for a visitor: the home topic, podcast, and post cards from the payload, the
// sections in their order with each week's section absent while it has no card, the home topics' structured data, the
// headline, the video's button beside the logo, and the header's links without JavaScript

import { afterAll, beforeAll, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { HomeResponse } from "@carlnotes/contracts/home"
import { toPodcastEpisodeSummaryFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { TOPIC_TUTORIAL_VIDEO } from "@carlnotes/contracts/youtube"
import { RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { loadRouter } from "@/routes/-loadRouter"

// a visitor's payload: one home topic with an image, no episodes, and one Topic Post
const HOME: HomeResponse = {
	homeTopics: [
		{
			id: "topic-1",
			name: "Espresso machines",
			path: "/topics/topic-1/espresso-machines",
			image: {
				page: { url: "/api/topic-images/topic-1/h/page.webp", url2x: "/api/topic-images/topic-1/h/page@2x.webp" },
				list: { url: "/api/topic-images/topic-1/h/list.webp", url2x: "/api/topic-images/topic-1/h/list@2x.webp" },
				thumbnail: {
					url: "/api/topic-images/topic-1/h/thumbnail.webp",
					url2x: "/api/topic-images/topic-1/h/thumbnail@2x.webp",
				},
			},
			tags: ["coffee"],
			owner: { userId: "u1", username: "carl", avatarSource: "generated", avatarVersion: null },
			teamLink: null,
			reactionCount: 3,
			latestPodcastEpisode: null,
		},
	],
	homePodcastEpisodes: [],
	homeTopicPosts: [
		{
			id: "post-1",
			topicId: "topic-1",
			topicName: "Espresso machines",
			title: "Dialing in a new grinder",
			author: { userId: "u1", username: "carl", avatarSource: "generated", avatarVersion: null },
			publishedAt: "2026-11-09T12:00:00.000Z",
			wordCount: 320,
			image: null,
			summary: null,
			reactionCount: 0,
			path: "/topics/topic-1/espresso-machines/posts/post-1/dialing-in-a-new-grinder",
		},
	],
	newestPodcastEpisodes: [],
	yourTopics: null,
}

// the topic's podcast episode as a card, which a film section and a podcast section both draw
const PODCAST_EPISODE_CARD = {
	podcastEpisode: toPodcastEpisodeSummaryFixture(),
	topic: { id: "topic-1", name: "Espresso machines", path: "/topics/topic-1/espresso-machines", image: null },
	reactionCount: 0,
}

// a visitor's payload with a card in every section
const FULL_HOME: HomeResponse = {
	...HOME,
	homeTopicPodcastEpisodeVideos: [PODCAST_EPISODE_CARD],
	newestTopicPodcastEpisodeVideos: [PODCAST_EPISODE_CARD],
	homePodcastEpisodes: [PODCAST_EPISODE_CARD],
	newestPodcastEpisodes: [PODCAST_EPISODE_CARD],
	newestTopicPosts: HOME.homeTopicPosts,
}

// the payload the fake api serves, which a test replaces
let servedHome = HOME

// the real fetch, restored after the tests
const realFetch = globalThis.fetch

// a fake fetch that serves the home payload in place of the api, and a 404 for any other path
function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const requestUrl = input instanceof Request ? input.url : input.toString()
	return Promise.resolve(
		new URL(requestUrl).pathname === "/api/home"
			? Response.json(servedHome)
			: Response.json({ error: "not found" }, { status: 404 }),
	)
}

// swap the fake fetch in for these tests, and restore the real fetch after
beforeAll(() => {
	configureApiClient({ apiBaseUrl: "", showError: console.error })
	globalThis.fetch = fakeFetch as typeof fetch
})
afterAll(() => {
	globalThis.fetch = realFetch
})

// render the home page the way the server renders one request
async function renderHomePage(): Promise<string> {
	const { router } = await loadRouter("/")
	return renderToString(<RouterProvider router={router} />)
}

test("a visitor's home shows the headline, how it works, and the home topic and podcast cards with their images", async () => {
	const homePageHtml = await renderHomePage()
	expect(homePageHtml).toContain("Espresso machines")
	expect(homePageHtml).toContain('href="/topics/topic-1/espresso-machines"')
	expect(homePageHtml).toContain("/api/topic-images/topic-1/h/page@2x.webp 2x")
	expect(homePageHtml).toContain("He already read it.")
	expect(homePageHtml).toContain("How it works")
})

test("a visitor's home shows Featured posts with its card, and no section that holds no card", async () => {
	const homePageHtml = await renderHomePage()
	expect(homePageHtml).toContain("Featured posts")
	expect(homePageHtml).toContain('href="/topics/topic-1/espresso-machines/posts/post-1/dialing-in-a-new-grinder"')

	// the payload holds no podcast episode, so neither podcast section shows
	expect(homePageHtml).not.toContain("Featured podcasts")
	expect(homePageHtml).not.toContain("New podcasts this week")

	// a week with no new film and no new post shows neither of their sections
	expect(homePageHtml).not.toContain("New films this week")
	expect(homePageHtml).not.toContain("New posts this week")
})

test("a visitor's home shows its sections in order, each week's new cards right after their home cards", async () => {
	// serve a card in every section for this render alone
	servedHome = FULL_HOME
	const homePageHtml = await renderHomePage().finally(() => {
		servedHome = HOME
	})

	// each section's title, where the html writes it as a section's button
	const sectionTitles = [
		"Featured topics",
		"Featured films",
		"New films this week",
		"Featured podcasts",
		"New podcasts this week",
		"Featured posts",
		"New posts this week",
	]
	const titleIndexes = sectionTitles.map((sectionTitle) => homePageHtml.indexOf(`>${sectionTitle}<`))
	expect(titleIndexes).not.toContain(-1)
	expect(titleIndexes).toEqual(titleIndexes.toSorted((titleIndex, otherIndex) => titleIndex - otherIndex))
})

test("a visitor's home head holds the home topics as an ItemList", async () => {
	const homePageHtml = await renderHomePage()
	expect(homePageHtml).toContain('"@type":"ItemList"')
	expect(homePageHtml).toContain(
		'"position":1,"name":"Espresso machines","url":"https://carlnotes.com/topics/topic-1/espresso-machines"',
	)
})

// the header shows the video's button beside the logo, linked to YouTube
test("a visitor's header links the video on making a topic beside the logo", async () => {
	const homePageHtml = await renderHomePage()
	expect(homePageHtml).toContain(`href="https://www.youtube.com/watch?v=${TOPIC_TUTORIAL_VIDEO.youtubeVideoId}"`)
	expect(homePageHtml).toContain(`aria-label="Watch ${TOPIC_TUTORIAL_VIDEO.name}"`)
})

// the hamburger menu opens by script, so the html keeps the links shown and the menu's button hidden until a script runs
test("a visitor's header shows its links without JavaScript, and its menu button only with it", async () => {
	const [headerHtml = ""] = (await renderHomePage()).match(/<header[\s\S]*?<\/header>/) ?? []

	// the links' row hides on a narrow screen only once the page is scripted, and each link is a plain anchor in it
	const [linksRow = ""] = headerHtml.match(/<div class="[^"]*max-sm:scripted:hidden[^"]*">[\s\S]*?<\/div>/) ?? []
	expect(linksRow).not.toMatch(/^<div class="(?:[^"]* )?hidden[ "]/)
	for (const href of ["/topics", "/plans", "/login?next=%2F", "/signup?cta=header"]) {
		expect(linksRow).toContain(`href="${href}"`)
	}

	// the menu's button starts hidden, and shows on a narrow screen once the page is scripted
	const [menuButton = ""] = headerHtml.match(/<button[^>]*data-slot="popover-trigger"[^>]*>/) ?? []
	expect(menuButton).toMatch(/class="(?:[^"]* )?hidden [^"]*max-sm:scripted:grid/)
})
