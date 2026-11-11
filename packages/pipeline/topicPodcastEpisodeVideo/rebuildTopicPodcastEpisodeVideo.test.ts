// the film rebuild's skips, with the connection pool stubbed: a film drawn from the image it shows now, its own or else
// its podcast episode's, and an owner past the spend cutoff are left as they are
import { afterEach, expect, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import { rebuildTopicPodcastEpisodeVideo } from "./rebuildTopicPodcastEpisodeVideo"

// a published podcast episode with audio and its own image, in the column order the film's read selects
const PUBLISHED_PODCAST_EPISODE_ROW = [
	"topic-1",
	"owner-1",
	"published",
	"Agents that review code",
	2026,
	14,
	"episodes/episode-1/audio.mp3",
	null,
	"image-new",
	"AI Agents",
	null,
]

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// answer the podcast episode read and the film read, which was drawn from an image of the given hash. the film has
// its own image if a hash for one is given
function stubRebuildReads(
	renderedImageHash: string,
	topicPodcastEpisodeVideoImageHash: string | null = null,
): SentQuery[] {
	const readyFilmRow = ["ready", "intro.mp4", "chapters.mp4", "sign-off.mp4", "film.mp4", renderedImageHash]
	return stubConnectionPool(({ text }) => {
		// the podcast episode read with its film's own image last, then the film read, and no rows for anything else
		if (text.includes('from "episodes" inner join "topics"')) {
			return [[...PUBLISHED_PODCAST_EPISODE_ROW, topicPodcastEpisodeVideoImageHash]]
		}
		return text.startsWith('select "status"') ? [readyFilmRow] : []
	})
}

// whether the film row was updated
function isFilmRowUpdated(sentQueries: SentQuery[]): boolean {
	return sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "topic_podcast_episode_videos"'))
}

// a film already drawn from the image the podcast episode shows needs no rebuild
test("a film drawn from the current image is skipped", async () => {
	const sentQueries = stubRebuildReads("image-new")
	const rebuildResult = await rebuildTopicPodcastEpisodeVideo("episode-1")
	expect(rebuildResult).toEqual({ outcome: "skipped", reason: "current" })
	expect(isFilmRowUpdated(sentQueries)).toBe(false)
})

// a film with its own image is current while it was drawn from that image, whatever its podcast episode shows now
test("a film drawn from its own image is skipped, though its podcast episode's image changed", async () => {
	const sentQueries = stubRebuildReads("film-image", "film-image")
	const rebuildResult = await rebuildTopicPodcastEpisodeVideo("episode-1")
	expect(rebuildResult).toEqual({ outcome: "skipped", reason: "current" })
	expect(isFilmRowUpdated(sentQueries)).toBe(false)
})

// an owner past the podcast episode spend cutoff keeps the film that plays now
test("an owner past the spend cutoff keeps the stale film", async () => {
	// the film shows an old image, and the owner is past the cutoff
	const sentQueries = stubRebuildReads("image-old")
	const cutoffSpy = spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	try {
		const rebuildResult = await rebuildTopicPodcastEpisodeVideo("episode-1")
		expect(rebuildResult).toEqual({ outcome: "skipped", reason: "spend-cutoff" })
	} finally {
		cutoffSpy.mockRestore()
	}

	// nothing was written
	expect(isFilmRowUpdated(sentQueries)).toBe(false)
})
