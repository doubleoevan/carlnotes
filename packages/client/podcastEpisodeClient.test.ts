import { afterEach, expect, mock, test } from "bun:test"
import { configureApiClient } from "./apiClient"
import { stubFailingFetch, stubFetch } from "./fetchTestFixtures"
import {
	fetchPodcastEpisode,
	fetchPodcastEpisodeAudio,
	fetchPodcastFeedUrl,
	fetchSeasonPodcastEpisodes,
	sendResetPodcastFeed,
} from "./podcastEpisodeClient"

// restore the client and transport after each test
const realFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = realFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("audio resolution sends the session only to the API and refuses redirects", async () => {
	// resolve a signed URL through an authenticated request
	const audioUrl = "https://media.example/audio.mp3?X-Amz-Signature=private"
	const fetch = mock(async () => Response.json({ audioUrl, expiresAt: "2026-10-28T20:00:00Z" }))
	globalThis.fetch = fetch as unknown as typeof globalThis.fetch
	configureApiClient({
		apiBaseUrl: "https://carlnotes.example",
		showError: () => {},
		headers: () => ({ Cookie: "session" }),
	})
	// verify the API request refuses redirects and caching
	expect((await fetchPodcastEpisodeAudio("episode-1")).audioUrl).toBe(audioUrl)
	expect(fetch).toHaveBeenCalledTimes(1)
	expect(fetch).toHaveBeenCalledWith(
		"https://carlnotes.example/api/episodes/episode-1/audio.mp3",
		expect.objectContaining({ redirect: "error", cache: "no-store" }),
	)
})

test("error-aware reads distinguish denied access and server failure while defaults stay nullable", async () => {
	// exercise each response policy across episode and feed reads
	for (const status of [401, 403, 404, 500, 503]) {
		for (const read of [fetchPodcastEpisode, fetchPodcastFeedUrl, sendResetPodcastFeed]) {
			stubFetch(Response.json({ error: "unavailable" }, { status }))
			expect(await read("id")).toBeNull()
			stubFetch(Response.json({ error: "unavailable" }, { status }))
			await expect(read("id", { shouldThrowOnError: true })).rejects.toMatchObject({
				status,
				isAccessDenied: status < 500,
			})
		}
		stubFetch(Response.json({ error: "unavailable" }, { status }))
		await expect(fetchPodcastEpisodeAudio("id")).rejects.toMatchObject({ status, isAccessDenied: status < 500 })
	}
})

test("transport failures remain retryable and never become denied access", async () => {
	// keep transport errors distinct from a confirmed access denial
	stubFailingFetch()
	await expect(fetchPodcastEpisodeAudio("id")).rejects.toBeInstanceOf(TypeError)
	await expect(fetchPodcastFeedUrl("id", { shouldThrowOnError: true })).rejects.toBeInstanceOf(TypeError)
})

// preserve the web's empty fallback while allowing mobile to distinguish retry from an empty season
test("season failures preserve default results and opt in to actionable errors", async () => {
	// compare default season fallback with explicit errors
	for (const status of [403, 500]) {
		stubFetch(Response.json({}, { status }))
		expect(await fetchSeasonPodcastEpisodes({ topicId: "topic", season: 2025 })).toEqual({ podcastEpisodes: [] })
		stubFetch(Response.json({}, { status }))
		await expect(
			fetchSeasonPodcastEpisodes({ topicId: "topic", season: 2025, shouldThrowOnError: true }),
		).rejects.toMatchObject({
			status,
		})
	}
	// retain transport errors for the retry control and forward account-owned cancellation
	stubFailingFetch()
	expect(await fetchSeasonPodcastEpisodes({ topicId: "topic", season: 2025 })).toEqual({ podcastEpisodes: [] })
	await expect(
		fetchSeasonPodcastEpisodes({ topicId: "topic", season: 2025, shouldThrowOnError: true }),
	).rejects.toBeInstanceOf(TypeError)
	const controller = new AbortController()
	controller.abort()
	await expect(
		fetchSeasonPodcastEpisodes({ topicId: "topic", season: 2025, signal: controller.signal, shouldThrowOnError: true }),
	).rejects.toBeDefined()
})

test("a Topic Post discussion's audio resolves on its post's route, and its read finds no podcast episode", async () => {
	// the player's id of a discussion names its post
	const fetch = mock(async (_url: string) =>
		Response.json({ audioUrl: "https://media.example/d.mp3", expiresAt: "2026-11-10T20:00:00Z" }),
	)
	globalThis.fetch = fetch as unknown as typeof globalThis.fetch
	await fetchPodcastEpisodeAudio("topic-post-discussion:post-1:discussion-1")
	expect(String(fetch.mock.calls[0]?.[0])).toEndWith("/api/topic-posts/post-1/discussion/audio.mp3")

	// a post that is gone, or that the user may not read, has no discussion to play
	stubFetch(Response.json({ error: "not found" }, { status: 404 }))
	expect(await fetchPodcastEpisode("topic-post-discussion:post-1:discussion-1")).toBeNull()
})
