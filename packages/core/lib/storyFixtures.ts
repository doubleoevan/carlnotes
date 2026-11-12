// the date and the image that the stories' fixtures share
import type { TopicImageUrls } from "@carlnotes/contracts/topicImages"

/** The instant every story fixture was created and updated. */
export const FIXTURE_DATE = new Date("2026-10-01T12:00:00.000Z")

// the placeholder that each app serves from its public files
const STORY_TOPIC_IMAGE_FILES = { url: "/podcast-cover-placeholder.jpg", url2x: "/podcast-cover-placeholder.jpg" }

/** The image a story's topic, podcast episode, Topic Post, or news row shows, at every size. */
export const STORY_TOPIC_IMAGE: TopicImageUrls = {
	page: STORY_TOPIC_IMAGE_FILES,
	list: STORY_TOPIC_IMAGE_FILES,
	thumbnail: STORY_TOPIC_IMAGE_FILES,
}
