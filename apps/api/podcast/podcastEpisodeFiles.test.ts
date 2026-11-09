import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as storage from "@carlnotes/db/store"
import * as analytics from "@carlnotes/server/analytics"
import { Hono } from "hono"
import * as viewerCounts from "../counts/viewerCounts"
import { toSignedInApp } from "../testSession"
import { toPlayToken } from "./playTokens"
import { isFirstAudioRequest, toPodcastEpisodeAudioResponse } from "./podcastEpisodeFiles"
import type { PodcastEpisodeRow } from "./podcastEpisodeRows"
import * as episodeRows from "./podcastEpisodeRows"
import { podcastEpisodesRoute } from "./podcastEpisodes"

const episode: PodcastEpisodeRow = {
	id: "episode-1",
	topicId: "topic-1",
	scanId: "scan-1",
	status: "published",
	title: "Episode",
	description: null,
	season: 2026,
	episodeNumber: 1,
	audioKey: "audio-key",
	audioByteSize: 1234,
	durationSeconds: 60,
	listenerCount: 0,
	publishedAt: new Date(),
	imageHash: null,
}
const audioUrl = "https://media.example/audio.mp3?X-Amz-Signature=private"
afterEach(() => mock.restore())

test("audio JSON is no-store while GET redirects and HEAD retains range metadata", async () => {
	// the JSON form is no-store and varies by Accept
	spyOn(storage, "toPodcastEpisodeAudioUrl").mockReturnValue(audioUrl)
	const app = new Hono().get("/audio", (context) => toPodcastEpisodeAudioResponse(context, episode))
	const response = await app.request("/audio", { headers: { Accept: "application/json" } })
	expect(response.status).toBe(200)
	expect(response.headers.get("Cache-Control")).toBe("private, no-store")
	expect(response.headers.get("Vary")).toBe("Accept")

	// its body holds the signed url, which lasts about an hour
	const body = await response.json()
	expect(body.audioUrl).toBe(audioUrl)
	expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(3_590_000)

	// a plain GET redirects to the signed url
	const redirect = await app.request("/audio")
	expect(redirect.status).toBe(302)
	expect(redirect.headers.get("Location")).toBe(audioUrl)

	// a HEAD keeps the length and range headers with an empty body
	const head = await app.request("/audio", { method: "HEAD", headers: { Accept: "application/json" } })
	expect(head.status).toBe(200)
	expect(head.headers.get("Content-Length")).toBe("1234")
	expect(head.headers.get("Accept-Ranges")).toBe("bytes")
	expect(await head.text()).toBe("")
})

test("JSON audio uses the existing access decision and listen rate limit", async () => {
	// the access check and the listen rate limit, as spies
	spyOn(storage, "toPodcastEpisodeAudioUrl").mockReturnValue(audioUrl)
	const access = spyOn(episodeRows, "loadAccessiblePodcastEpisode").mockResolvedValue(null)
	const count = spyOn(viewerCounts, "countWithinRateLimit").mockResolvedValue(undefined)
	const app = toSignedInApp(podcastEpisodesRoute, "owner")
	const init = { headers: { Accept: "application/json" } }

	// a podcast episode the user cannot open is a no-store 404 that counts no listen
	const denied = await app.request("/episodes/episode-1/audio.mp3", init)
	expect(denied.status).toBe(404)
	expect(denied.headers.get("Cache-Control")).toBe("private, no-store")
	expect(access).toHaveBeenCalledWith({ userId: "owner", podcastEpisodeId: "episode-1" })
	expect(count).not.toHaveBeenCalled()

	// a podcast episode the user can open returns 200 and counts one listen, and a HEAD counts none
	access.mockResolvedValue({ podcastEpisodeRow: episode, topic: {} as episodeRows.TopicRow })
	expect((await app.request("/episodes/episode-1/audio.mp3", init)).status).toBe(200)
	expect(count).toHaveBeenCalledTimes(1)
	await app.request("/episodes/episode-1/audio.mp3", { ...init, method: "HEAD" })
	expect(count).toHaveBeenCalledTimes(1)
})

test("an audio request is first if it has no range or starts at the first byte", () => {
	expect(isFirstAudioRequest(undefined)).toBe(true)
	expect(isFirstAudioRequest("bytes=0-")).toBe(true)
	expect(isFirstAudioRequest("bytes=4096-")).toBe(false)
})

test("an MCP view's first audio request reports the play of the user its token names", async () => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	spyOn(storage, "toPodcastEpisodeAudioUrl").mockReturnValue(audioUrl)
	spyOn(viewerCounts, "countWithinRateLimit").mockResolvedValue(undefined)
	const topic = { id: "topic-1", visibility: "private" } as episodeRows.TopicRow
	spyOn(episodeRows, "loadAccessiblePodcastEpisode").mockResolvedValue({ podcastEpisodeRow: episode, topic })
	const trackEventSpy = spyOn(analytics, "trackEvent")

	// the audio's url with a play token, requested with a range
	const requestAudio = (userId: string | null, range: string): Response | Promise<Response> => {
		const playToken = encodeURIComponent(toPlayToken({ podcastEpisodeId: "episode-1", userId }))
		return podcastEpisodesRoute.request(`/episodes/episode-1/audio.mp3?play=${playToken}`, {
			headers: { Range: range },
		})
	}

	// the first request reports the play, and a seek and a visitor's token report nothing
	await requestAudio("user-1", "bytes=0-")
	await requestAudio("user-1", "bytes=4096-")
	await requestAudio(null, "bytes=0-")
	expect(trackEventSpy.mock.calls).toEqual([
		[
			"episode_played",
			"user-1",
			{ entryPoint: "mcp", topicId: "topic-1", isTopicPublic: false, episodeId: "episode-1" },
		],
	])

	// a session's play saves a listen, which reports it instead
	trackEventSpy.mockClear()
	await toSignedInApp(podcastEpisodesRoute, "owner").request("/episodes/episode-1/audio.mp3")
	expect(trackEventSpy).not.toHaveBeenCalled()
})
