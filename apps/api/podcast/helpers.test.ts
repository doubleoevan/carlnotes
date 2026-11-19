// a season's podcast episodes: each says whether it has a ready film and whether its film is rendering, and the films
// filter keeps only those with a ready film. a topic page's podcast lists every ready film's card, newest first
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as podcastEpisodeSettings from "@carlnotes/server/podcastEpisodeSettings"
import * as topicCards from "../home/topicCards"
import { loadSeasonPodcastEpisodes, loadTopicPodcast } from "./helpers"
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
		sentQuery.text.includes('from "topic_videos"')
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

test("a topic page's podcast lists the cards of its ready films, newest first", async () => {
	// three podcast episodes, newest first. episode-3 and episode-1 have ready films, and the film of episode-2 is
	// rendering. the card loader returns one card for each id it gets
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	spyOn(podcastEpisodeSettings, "isPodcastEpisodeRecordingConfigured").mockReturnValue(true)
	spyOn(episodeRows, "loadPublishedPodcastEpisodeRows").mockResolvedValue([
		toPodcastEpisodeRow("episode-3", 3),
		toPodcastEpisodeRow("episode-2", 2),
		toPodcastEpisodeRow("episode-1", 1),
	])
	stubConnectionPool((sentQuery) =>
		sentQuery.text.includes('from "topic_videos"')
			? [
					["episode-3", "ready", 5678],
					["episode-2", "rendering", null],
					["episode-1", "ready", 1234],
				]
			: [],
	)
	const loadPodcastEpisodeCards = spyOn(topicCards, "loadPodcastEpisodeCards").mockImplementation(
		async (podcastEpisodeIds) =>
			podcastEpisodeIds.map((podcastEpisodeId) => ({
				podcastEpisode: { id: podcastEpisodeId },
				topic: { id: "topic-1", name: "Coffee", path: "/topics/topic-1", image: null },
				reactionCount: 0,
			})) as Awaited<ReturnType<typeof topicCards.loadPodcastEpisodeCards>>,
	)

	// the cards are the two ready films, newer first, and the rendering film has none
	const { topicPodcastEpisodeVideoCards } = await loadTopicPodcast(topic, null)
	expect(loadPodcastEpisodeCards).toHaveBeenCalledWith(["episode-3", "episode-1"])
	expect(topicPodcastEpisodeVideoCards.map((podcastEpisodeCard) => podcastEpisodeCard.podcastEpisode.id)).toEqual([
		"episode-3",
		"episode-1",
	])
})
