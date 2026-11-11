// a season's podcast episodes: each says whether it has a ready film and whether its film is rendering, and the films
// filter keeps only those with a ready film
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadSeasonPodcastEpisodes } from "./helpers"
import type { PodcastEpisodeRow, TopicRow } from "./podcastEpisodeRows"
import * as episodeRows from "./podcastEpisodeRows"

// a public topic, and a published podcast episode of the 2026 season
const topic = { id: "topic-1", name: "Coffee", visibility: "public", imageHash: null } as TopicRow
const toPodcastEpisodeRow = (id: string, episodeNumber: number): PodcastEpisodeRow => ({
	id,
	topicId: "topic-1",
	scanId: `scan-${id}`,
	status: "published",
	title: `Episode ${episodeNumber}`,
	description: null,
	season: 2026,
	episodeNumber,
	audioKey: `audio-${id}`,
	audioByteSize: 1234,
	durationSeconds: 60,
	listenerCount: 0,
	publishedAt: new Date(),
	imageHash: null,
})

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("the films filter keeps the season's podcast episodes with a ready film", async () => {
	// two podcast episodes. episode-2 has a ready film, and the film of episode-1 is rendering. the secret signs their
	// cover urls
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	spyOn(episodeRows, "loadPublishedPodcastEpisodeRows").mockResolvedValue([
		toPodcastEpisodeRow("episode-2", 2),
		toPodcastEpisodeRow("episode-1", 1),
	])
	stubConnectionPool((sentQuery) =>
		sentQuery.text.includes('from "topic_podcast_episode_videos"')
			? [
					["episode-2", "ready", 5678],
					["episode-1", "rendering", null],
				]
			: [],
	)

	// the whole season marks the podcast episode that has a film, and the one whose film is rendering
	const seasonOptions = { topic, userId: null, season: 2026 }
	const seasonPodcastEpisodes = await loadSeasonPodcastEpisodes(seasonOptions)
	const filmUrls = seasonPodcastEpisodes.podcastEpisodes.map((podcastEpisode) => podcastEpisode.video?.videoUrl ?? null)
	expect(filmUrls).toEqual(["/api/episodes/episode-2/video.mp4", null])
	expect(seasonPodcastEpisodes.podcastEpisodes.map((podcastEpisode) => podcastEpisode.isVideoRendering)).toEqual([
		false,
		true,
	])

	// the films filter keeps that podcast episode alone
	const seasonFilms = await loadSeasonPodcastEpisodes({ ...seasonOptions, hasVideo: "true" })
	expect(seasonFilms.podcastEpisodes.map((podcastEpisode) => podcastEpisode.id)).toEqual(["episode-2"])
})
