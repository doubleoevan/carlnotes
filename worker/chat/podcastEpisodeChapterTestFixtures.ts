// the podcast episode chapter that the tests and the evals ask a question from the podcast player during
import type { PodcastEpisodeChapterContext } from "./retrievePodcastEpisodeChapter"

// the burr set chapter of the quiet grinders podcast episode, with no lines and no finding
export const PODCAST_EPISODE_CHAPTER: PodcastEpisodeChapterContext = {
	podcastEpisodeId: "episode-1",
	podcastEpisodeTitle: "Grinders get quiet",
	chapterTitle: "The burr set",
	chapterPosition: 2,
	turns: [],
	finding: null,
}

/**
 * Returns the burr set chapter with the fields a test or an eval case sets itself.
 */
export function toPodcastEpisodeChapterContext(
	podcastEpisodeChapterOverrides: Partial<PodcastEpisodeChapterContext>,
): PodcastEpisodeChapterContext {
	return { ...PODCAST_EPISODE_CHAPTER, ...podcastEpisodeChapterOverrides }
}
