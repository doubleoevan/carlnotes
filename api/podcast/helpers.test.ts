// podcast helper tests: each feed topic's latest podcast episode, limited to what the user may listen to
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "../../db/connectionPoolStub"
import { podcastEpisodeChapters, type topics } from "../../db/schema"
import { loadLatestPodcastEpisodes } from "./helpers"

// the speech model, which turns podcast episodes on, and the secret that signs cover urls, put back after each test
const originalSettings = {
	PODCAST_SPEECH_MODEL: Bun.env.PODCAST_SPEECH_MODEL,
	BETTER_AUTH_SECRET: Bun.env.BETTER_AUTH_SECRET,
}
afterEach(() => {
	restoreConnectionPool()

	// put each setting back, or delete a setting that the test run never had
	for (const [settingName, originalSetting] of Object.entries(originalSettings)) {
		if (originalSetting === undefined) {
			delete Bun.env[settingName]
		} else {
			Bun.env[settingName] = originalSetting
		}
	}
})

// a topic row with only the fields that the podcast episode reads use
function toTopicRow(id: string, visibility: "public" | "invite"): typeof topics.$inferSelect {
	return { id, name: `Topic ${id}`, ownerId: "owner-1", teamId: null, visibility } as typeof topics.$inferSelect
}

// a published podcast episode row in the column order that the episode reads select
function toPublishedPodcastEpisodeRow(podcastEpisodeId: string, topicId: string): unknown[] {
	const podcastEpisodeFields = [podcastEpisodeId, topicId, "scan-1", "published", `Episode of ${topicId}`, null]
	return [...podcastEpisodeFields, 2026, 14, "audio-key", 1000, 1440, "2026-10-03T12:00:00.000Z"]
}

test("a visitor gets a public topic's latest podcast episode with its chapters, and none from an invite topic", async () => {
	// speech is on, cover urls can be signed, and each topic has a published podcast episode with one chapter
	Bun.env.PODCAST_SPEECH_MODEL = "test-speech-model"
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "episodes"')) {
			return [
				toPublishedPodcastEpisodeRow("public-episode", "public-topic"),
				toPublishedPodcastEpisodeRow("invite-episode", "invite-topic"),
			]
		}
		const chapterRow = toTableRow(podcastEpisodeChapters, {
			podcastEpisodeId: "public-episode",
			position: 0,
			title: "The quiet burrs",
			findingId: "finding-1",
			sourceUrl: "https://burrnotes.example/quiet-burrs",
			startSeconds: 0,
			endSeconds: 90,
		})
		return text.includes('from "episode_chapters"') ? [chapterRow] : []
	})

	// the public topic's episode comes back with its chapter, and the invite topic's episode is left out
	const latestPodcastEpisodeByTopic = await loadLatestPodcastEpisodes(
		[toTopicRow("public-topic", "public"), toTopicRow("invite-topic", "invite")],
		null,
	)
	expect([...latestPodcastEpisodeByTopic.keys()]).toEqual(["public-topic"])
	expect(latestPodcastEpisodeByTopic.get("public-topic")).toMatchObject({
		id: "public-episode",
		episodeNumber: 14,
		chapters: [{ position: 0, findingId: "finding-1" }],
	})

	// the chapters are read once, for the episode that the visitor may listen to alone
	const chapterQueries = sentQueries.filter((sentQuery) => sentQuery.text.includes('from "episode_chapters"'))
	expect(chapterQueries.map((chapterQuery) => chapterQuery.values)).toEqual([["public-episode"]])
})
