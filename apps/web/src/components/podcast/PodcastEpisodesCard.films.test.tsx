// Coffee Break films on the page the server renders: every film of the season, linked to its page, and no removal
import { expect, test } from "bun:test"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { PodcastEpisodesCard } from "./PodcastEpisodesCard"

// a season of seven films, newest first, and one podcast episode without a film
const toFilm = (index: number): PodcastEpisode =>
	toPodcastEpisodeFixture({
		id: `film-${index}`,
		title: `Film number ${7 - index}`,
		season: 2026,
		episodeNumber: 8 - index,
		video: {
			videoUrl: `/api/episodes/film-${index}/video.mp4`,
			captionsUrl: `/api/episodes/film-${index}/captions.vtt`,
		},
	})
const latestFilm = toFilm(0)
const films = [latestFilm, ...Array.from({ length: 6 }, (_, index) => toFilm(index + 1))]
const audioOnlyPodcastEpisode = toPodcastEpisodeFixture({ id: "audio-only", title: "Audio only", episodeNumber: 1 })

// a topic whose owner may remove podcast episodes, with Topic Cinema on the latest film
const topic = toTestTopicResponse({
	id: "topic-1",
	latestPodcastEpisode: latestFilm,
	podcast: {
		isEnabled: true,
		isCommentsEnabled: true,
		hasFullPodcastEpisodes: true,
		unpublishedPodcastEpisode: null,
		publicFeedUrl: null,
		seasons: [2026],
		latestSeasonPodcastEpisodes: { podcastEpisodes: [...films, audioOnlyPodcastEpisode] },
		canRemovePodcastEpisodes: true,
		topicPodcastEpisodeVideoSection: { podcastEpisode: latestFilm, isOpen: true },
	},
})

test("the server renders every film of the season with its page link, and no removal or podcast episode without one", async () => {
	const html = await renderWithRouter(<PodcastEpisodesCard topic={topic} format="video" />)
	expect(html).toContain("Coffee Break films")
	for (const film of films) {
		expect(html).toContain(film.title ?? "")
	}
	expect(html.match(/aria-label="Play film \d+"/g)).toHaveLength(7)
	expect(html).not.toContain("Audio only")
	expect(html).not.toMatch(/aria-label="Remove/)
	expect(html).toMatch(/<nav aria-label="Season 2026 film pages" class="[^"]*\bhidden scripted:flex/)
})

test("a topic without a film renders no Coffee Break films", async () => {
	const filmlessTopic = toTestTopicResponse({
		podcast: topic.podcast && { ...topic.podcast, topicPodcastEpisodeVideoSection: undefined },
	})
	expect(await renderWithRouter(<PodcastEpisodesCard topic={filmlessTopic} format="video" />)).toBe("")
})
