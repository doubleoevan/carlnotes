import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as storage from "@carlnotes/db/store"
import { Hono } from "hono"
import * as viewerCounts from "../counts/viewerCounts"
import { toSignedInApp } from "../testSession"
import { toPodcastEpisodeAudioResponse } from "./podcastEpisodeFiles"
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
}
const audioUrl = "https://media.example/audio.mp3?X-Amz-Signature=private"
afterEach(() => mock.restore())

test("audio JSON is no-store while GET redirects and HEAD retains range metadata", async () => {
	spyOn(storage, "toPodcastEpisodeAudioUrl").mockReturnValue(audioUrl)
	const app = new Hono().get("/audio", (context) => toPodcastEpisodeAudioResponse(context, episode))
	const response = await app.request("/audio", { headers: { Accept: "application/json" } })
	expect(response.status).toBe(200)
	expect(response.headers.get("Cache-Control")).toBe("private, no-store")
	expect(response.headers.get("Vary")).toBe("Accept")
	const body = await response.json()
	expect(body.audioUrl).toBe(audioUrl)
	expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(3_590_000)
	const redirect = await app.request("/audio")
	expect(redirect.status).toBe(302)
	expect(redirect.headers.get("Location")).toBe(audioUrl)
	const head = await app.request("/audio", { method: "HEAD", headers: { Accept: "application/json" } })
	expect(head.status).toBe(200)
	expect(head.headers.get("Content-Length")).toBe("1234")
	expect(head.headers.get("Accept-Ranges")).toBe("bytes")
	expect(await head.text()).toBe("")
})

test("JSON audio uses the existing access decision and listen rate limit", async () => {
	spyOn(storage, "toPodcastEpisodeAudioUrl").mockReturnValue(audioUrl)
	const access = spyOn(episodeRows, "loadAccessiblePodcastEpisode").mockResolvedValue(null)
	const count = spyOn(viewerCounts, "countWithinRateLimit").mockResolvedValue(undefined)
	const app = toSignedInApp(podcastEpisodesRoute, "owner")
	const init = { headers: { Accept: "application/json" } }
	const denied = await app.request("/episodes/episode-1/audio.mp3", init)
	expect(denied.status).toBe(404)
	expect(denied.headers.get("Cache-Control")).toBe("private, no-store")
	expect(access).toHaveBeenCalledWith({ userId: "owner", podcastEpisodeId: "episode-1" })
	expect(count).not.toHaveBeenCalled()
	access.mockResolvedValue({ podcastEpisodeRow: episode, topic: {} as episodeRows.TopicRow })
	expect((await app.request("/episodes/episode-1/audio.mp3", init)).status).toBe(200)
	expect(count).toHaveBeenCalledTimes(1)
	await app.request("/episodes/episode-1/audio.mp3", { ...init, method: "HEAD" })
	expect(count).toHaveBeenCalledTimes(1)
})
