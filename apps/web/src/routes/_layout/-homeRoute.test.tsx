// the home page as the server renders it for a visitor: the featured cards from the payload, the featured topics'
// structured data, the headline, and the video's button beside the logo

import { afterAll, beforeAll, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { HomeResponse } from "@carlnotes/contracts/home"
import { TOPIC_TUTORIAL_VIDEO } from "@carlnotes/contracts/youtube"
import { RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { loadRouter } from "@/routes/-loadRouter"

// a visitor's payload: one featured topic with an image and no episodes
const HOME: HomeResponse = {
	featuredTopics: [
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
	featuredPodcastEpisodes: [],
	newestPodcastEpisodes: [],
	yourTopics: null,
}

// the real fetch, restored after the tests
const realFetch = globalThis.fetch

// a fake fetch that serves the home payload in place of the api, and a 404 for any other path
function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const requestUrl = input instanceof Request ? input.url : input.toString()
	return Promise.resolve(
		new URL(requestUrl).pathname === "/api/home"
			? Response.json(HOME)
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

test("a visitor's home shows the headline, how it works, and the featured cards with their images", async () => {
	const homePageHtml = await renderHomePage()
	expect(homePageHtml).toContain("Espresso machines")
	expect(homePageHtml).toContain('href="/topics/topic-1/espresso-machines"')
	expect(homePageHtml).toContain("/api/topic-images/topic-1/h/page@2x.webp 2x")
	expect(homePageHtml).toContain("He already read it.")
	expect(homePageHtml).toContain("How it works")
})

test("a visitor's home head holds the featured topics as an ItemList", async () => {
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
