// the podcast episode fixtures for the ui tests: a published podcast episode's summary, as a table row and its play
// button read it, a chapter, a full podcast episode as the player shows it, and a topic's podcast as its page shows it
import type { PodcastEpisode, PodcastEpisodeChapter, PodcastEpisodeSummary, TopicPodcast } from "./podcast"

/**
 * Returns a published podcast episode's summary with twelve chapters, with any of its fields replaced.
 */
export function toPodcastEpisodeSummaryFixture(
	podcastEpisodeSummaryFields: Partial<PodcastEpisodeSummary> = {},
): PodcastEpisodeSummary {
	return {
		id: "episode-1",
		title: "Robot vacuums, ranked",
		description: "Six robot vacuums, ranked by how well they find the corners.",
		season: 2026,
		episodeNumber: 7,
		durationSeconds: 600,
		publishedAt: "2026-10-01T00:00:00.000Z",
		pagePath: "/topics/topic-1/robots/episodes/2026/7",
		chapterCount: 12,
		image: null,
		...podcastEpisodeSummaryFields,
	}
}

/**
 * Returns a podcast episode's first chapter, a minute long with no finding, with any of its fields replaced.
 */
export function toPodcastEpisodeChapterFixture(
	podcastEpisodeChapterFields: Partial<PodcastEpisodeChapter> = {},
): PodcastEpisodeChapter {
	return {
		position: 0,
		title: "Chapter 1",
		findingId: null,
		sourceUrl: "https://example.com",
		rating: null,
		faviconPath: null,
		startSeconds: 0,
		endSeconds: 60,
		...podcastEpisodeChapterFields,
	}
}

/**
 * Returns a published podcast episode as the player shows it, on a public topic with voice on, with two minute-long
 * chapters and no cover, with any of its fields replaced.
 */
export function toPodcastEpisodeFixture(podcastEpisodeFields: Partial<PodcastEpisode> = {}): PodcastEpisode {
	return {
		...toPodcastEpisodeSummaryFixture(),
		chapterCount: 2,
		topicId: "topic-1",
		topicVisibility: "public",
		status: "published",
		audioUrl: "/api/episodes/episode-1/audio.mp3",
		coverUrl: null,
		smallCoverUrl: null,
		chapters: [0, 1].map((position) =>
			toPodcastEpisodeChapterFixture({
				position,
				title: `Chapter ${position + 1}`,
				startSeconds: position * 60,
				endSeconds: (position + 1) * 60,
			}),
		),
		progressSeconds: 0,
		isCompleted: false,
		isVoiceChatConfigured: true,
		...podcastEpisodeFields,
	}
}

/**
 * Returns an enabled topic podcast with a 2026 season and no podcast episode in it, with any of its fields replaced.
 */
export function toTopicPodcastFixture(topicPodcastFields: Partial<TopicPodcast> = {}): TopicPodcast {
	return {
		isEnabled: true,
		isCommentsEnabled: true,
		hasFullPodcastEpisodes: true,
		canRemovePodcastEpisodes: false,
		unpublishedPodcastEpisode: null,
		seasons: [2026],
		latestSeasonPodcastEpisodes: { podcastEpisodes: [] },
		publicFeedUrl: null,
		...topicPodcastFields,
	}
}
