// the invented podcast episodes the stories show: a builder for one, and the LLM tooling topic's season of twelve
import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodePath } from "@carlnotes/contracts/seo"
import { DAY_MS } from "@carlnotes/contracts/time"
import { FIXTURE_DATE, LLM_TOOLING_TOPIC_FIXTURE } from "../fixtures"

// the season every fixture podcast episode was published in
const STORY_PODCAST_SEASON = 2026

// the titles of the season's older podcast episodes, newest first
const OLDER_PODCAST_EPISODE_TITLES = [
	"Tool calling grows up",
	"Small models, sharp evals",
	"The week in vector search",
	"Prompt caching in practice",
	"Open weights roundup",
	"Retrieval without the pain",
	"Structured output everywhere",
	"Local inference on laptops",
	"Benchmarks worth trusting",
	"What shipped in agent frameworks",
	"Reading the model cards",
]

// the newest podcast episode's number in the season
const LATEST_PODCAST_EPISODE_NUMBER = OLDER_PODCAST_EPISODE_TITLES.length + 1

// a published podcast episode's own fields, the topic whose page it links after, and a publish time if not the
// fixture date
type ToStoryPodcastEpisodeOptions = Pick<
	PodcastEpisodeSummary,
	"id" | "title" | "description" | "durationSeconds" | "chapterCount"
> & {
	topic: { id: string; name: string }
	episodeNumber: number
	publishedAt?: string
}

/** The season's newest podcast episode. */
export const LATEST_PODCAST_EPISODE_FIXTURE = toSeasonPodcastEpisode({
	episodeNumber: LATEST_PODCAST_EPISODE_NUMBER,
	title: "Agents that read the docs",
})

/** The season's twelve podcast episodes, newest first. */
export const PODCAST_EPISODE_FIXTURES: PodcastEpisodeSummary[] = [
	LATEST_PODCAST_EPISODE_FIXTURE,
	...OLDER_PODCAST_EPISODE_TITLES.map((title, i) =>
		toSeasonPodcastEpisode({ episodeNumber: LATEST_PODCAST_EPISODE_NUMBER - 1 - i, title }),
	),
]

/**
 * Returns a podcast episode published in the 2026 season, linked to its page, on the fixture date unless given another.
 */
export function toStoryPodcastEpisode({
	topic,
	id,
	title,
	description,
	episodeNumber,
	durationSeconds,
	chapterCount,
	publishedAt = FIXTURE_DATE.toISOString(),
}: ToStoryPodcastEpisodeOptions): PodcastEpisodeSummary {
	return {
		id,
		title,
		description,
		season: STORY_PODCAST_SEASON,
		episodeNumber,
		durationSeconds,
		publishedAt,
		pagePath: toPodcastEpisodePath(topic, { season: STORY_PODCAST_SEASON, episodeNumber }),
		chapterCount,
	}
}

// one podcast episode of the LLM tooling topic's season, published a week after the one before it
function toSeasonPodcastEpisode({
	episodeNumber,
	title,
}: {
	episodeNumber: number
	title: string
}): PodcastEpisodeSummary {
	return toStoryPodcastEpisode({
		topic: LLM_TOOLING_TOPIC_FIXTURE,
		id: `podcast-episode-${episodeNumber}`,
		title,
		description: `Carl's notes on ${title.toLowerCase()}, from the week's findings.`,
		episodeNumber,
		durationSeconds: 900 + episodeNumber * 60,
		chapterCount: 4 + (episodeNumber % 4),
		publishedAt: new Date(
			FIXTURE_DATE.getTime() - (LATEST_PODCAST_EPISODE_NUMBER - episodeNumber) * 7 * DAY_MS,
		).toISOString(),
	})
}
