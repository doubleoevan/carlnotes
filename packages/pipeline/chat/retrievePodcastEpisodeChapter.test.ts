// the chapter a podcast question names: its lines as they played, and its finding while the topic has it
import { afterEach, expect, test } from "bun:test"
import type { PodcastEpisodeScript } from "@carlnotes/contracts/podcast"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadPodcastEpisodeChapterContext } from "./retrievePodcastEpisodeChapter"

afterEach(restoreConnectionPool)

// a script of one segment with two chapters, its transition and the cold open before them and the sign-off after
const PODCAST_EPISODE_SCRIPT: PodcastEpisodeScript = {
	coldOpen: [{ speaker: "host", text: "Welcome back." }],
	segments: [
		{
			transition: [{ speaker: "cohost", text: "First up, grinders." }],
			chapters: [
				{ findingId: "finding-1", title: "The burr set", turns: [{ speaker: "host", text: "Quieter burrs." }] },
				{ findingId: "finding-2", title: "The motor", turns: [{ speaker: "cohost", text: "A new motor?" }] },
			],
		},
	],
	signOff: [{ speaker: "host", text: "See you tomorrow." }],
}

// the query names the podcast episode on the topic, published, with the chapter at the position, and the chapter's
// lines are the ones that play during it. a kept finding reads its snippet as the summary and its stored content
test("a chapter on the topic's published podcast episode loads with its lines and its finding", async () => {
	const sentQueries = stubConnectionPool((sentQuery) =>
		sentQuery.text.includes('from "episodes"')
			? [["Grinders get quiet", PODCAST_EPISODE_SCRIPT, "The motor", "finding-2"]]
			: [
					[
						"finding-2",
						"The reader wants quiet grinders.",
						"A quieter motor",
						"https://example.com/motor",
						"A new motor ships.",
						null,
					],
				],
	)
	const podcastEpisodeChapter = await loadPodcastEpisodeChapterContext({
		topicId: "topic-1",
		podcastEpisodeId: "episode-1",
		chapterPosition: 1,
	})
	expect(sentQueries[0]?.values).toEqual(expect.arrayContaining(["episode-1", "topic-1", "published", 1]))
	expect(podcastEpisodeChapter).toEqual({
		podcastEpisodeId: "episode-1",
		podcastEpisodeTitle: "Grinders get quiet",
		chapterTitle: "The motor",
		chapterPosition: 1,
		turns: [
			{ speaker: "cohost", text: "A new motor?" },
			{ speaker: "host", text: "See you tomorrow." },
		],
		finding: {
			summary: "A new motor ships.",
			relevanceExplanation: "The reader wants quiet grinders.",
			content: "A new motor ships.",
		},
	})
})

// a chapter whose finding a scan filtered out keeps its title and lines and reads no finding
test("a filtered-out chapter loads with its lines and no finding", async () => {
	const sentQueries = stubConnectionPool(() => [["Grinders get quiet", PODCAST_EPISODE_SCRIPT, "The burr set", null]])
	const podcastEpisodeChapter = await loadPodcastEpisodeChapterContext({
		topicId: "topic-1",
		podcastEpisodeId: "episode-1",
		chapterPosition: 0,
	})
	expect(podcastEpisodeChapter?.finding).toBeNull()
	expect(podcastEpisodeChapter?.turns.map((turn) => turn.text)).toEqual([
		"Welcome back.",
		"First up, grinders.",
		"Quieter burrs.",
	])
	expect(sentQueries).toHaveLength(1)
})

// a podcast episode of another topic, an unpublished one, or a missing position matches no row
test("a chapter the topic's published podcast episodes do not have loads as null", async () => {
	stubConnectionPool(() => [])
	expect(
		await loadPodcastEpisodeChapterContext({ topicId: "topic-1", podcastEpisodeId: "episode-9", chapterPosition: 7 }),
	).toBeNull()
})
