// the chat contract fixtures that the shared and ui tests share
import type { PodcastEpisodeNote } from "./chatQuestionNotes"

// the podcast episode, chapter, and speaker that a test question asked from the podcast player names
export const TEST_PODCAST_EPISODE_NOTE: PodcastEpisodeNote = {
	podcastEpisodeTitle: "Grinders get quiet",
	chapterPosition: 2,
	chapterTitle: "The burr set",
	speaker: "cohost",
}
