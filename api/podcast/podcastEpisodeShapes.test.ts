// podcast episode shape tests: each topic's latest podcast episode with its chapters or as a summary with its chapter
// count, limited to what the user may listen to
import { afterEach, expect, test } from "bun:test"
import { saveEnvSettings } from "@shared/savedEnvSettings"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "../../db/connectionPoolStub"
import { podcastEpisodeChapters } from "../../db/schema/podcast"
import type { topics } from "../../db/schema/topics"
import type { PodcastEpisodeRowTopic } from "./podcastEpisodeShapes"
import {
	loadLatestPodcastEpisodeSummaries,
	loadLatestPodcastEpisodes,
	loadPodcastEpisodeSummaries,
} from "./podcastEpisodeShapes"
import { toPublishedPodcastEpisodeRow } from "./podcastEpisodeTestFixtures"

// the speech model, which turns podcast episodes on, and the secret that signs cover urls, put back after each test
const restorePodcastSettings = saveEnvSettings(["PODCAST_SPEECH_MODEL", "BETTER_AUTH_SECRET"])
afterEach(() => {
	restoreConnectionPool()
	restorePodcastSettings()
})

// a topic row with only the fields that the podcast episode reads use
function toTopicRow(id: string, visibility: "public" | "invite"): typeof topics.$inferSelect {
	return { id, name: `Topic ${id}`, ownerId: "owner-1", teamId: null, visibility } as typeof topics.$inferSelect
}

// a published podcast episode row in the column order that the episode reads select
function toTopicPodcastEpisodeRow(podcastEpisodeId: string, topicId: string): unknown[] {
	return toPublishedPodcastEpisodeRow({
		id: podcastEpisodeId,
		topicId,
		title: `Episode of ${topicId}`,
		description: "Burrs.",
		episodeNumber: 14,
	})
}

test("a visitor gets a public topic's latest podcast episode with its chapters, and none from an invite topic", async () => {
	// speech is on, cover urls can be signed, and each topic has a published podcast episode with one chapter
	Bun.env.PODCAST_SPEECH_MODEL = "test-speech-model"
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "episodes"')) {
			return [
				toTopicPodcastEpisodeRow("public-episode", "public-topic"),
				toTopicPodcastEpisodeRow("invite-episode", "invite-topic"),
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

test("a summary of each topic's latest podcast episode counts its chapters in one query, and none from an invite topic", async () => {
	// speech is on, each topic has a published podcast episode, and the public topic's episode has twelve chapters
	Bun.env.PODCAST_SPEECH_MODEL = "test-speech-model"
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "episodes"')) {
			return [
				toTopicPodcastEpisodeRow("public-episode", "public-topic"),
				toTopicPodcastEpisodeRow("invite-episode", "invite-topic"),
			]
		}
		return text.includes('from "episode_chapters"') ? [["public-episode", 12]] : []
	})

	// the public topic's summary comes back with its count, its page, and its description, with no chapters, and the
	// invite topic's is left out
	const latestPodcastEpisodeSummaryByTopic = await loadLatestPodcastEpisodeSummaries(
		[toTopicRow("public-topic", "public"), toTopicRow("invite-topic", "invite")],
		null,
	)
	expect([...latestPodcastEpisodeSummaryByTopic.keys()]).toEqual(["public-topic"])
	expect(latestPodcastEpisodeSummaryByTopic.get("public-topic")).toEqual({
		id: "public-episode",
		title: "Episode of public-topic",
		description: "Burrs.",
		season: 2026,
		episodeNumber: 14,
		durationSeconds: 1440,
		publishedAt: "2026-10-03T12:00:00.000Z",
		pagePath: "/topics/public-topic/topic-public-topic/episodes/2026/14",
		chapterCount: 12,
	})

	// one count of the listenable episode's chapters, and no chapter rows
	const chapterQueries = sentQueries.filter((sentQuery) => sentQuery.text.includes('from "episode_chapters"'))
	expect(chapterQueries).toHaveLength(1)
	expect(chapterQueries[0]?.text).toContain("count(*)")
	expect(chapterQueries[0]?.text).toContain('group by "episode_chapters"."episode_id"')
	expect(chapterQueries[0]?.values).toEqual(["public-episode"])
})

test("summaries keep their order, and an episode with no chapter row counts none", async () => {
	// two podcast episodes, and a chapter count for the second alone
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "episode_chapters"') ? [["episode-2", 4]] : [],
	)
	const podcastEpisodeSummaries = await loadPodcastEpisodeSummaries([
		toPodcastEpisodeRowTopic("episode-1", 1),
		toPodcastEpisodeRowTopic("episode-2", 2),
	])

	// the order given, each with its own count, from one query
	expect(podcastEpisodeSummaries.map(({ id, chapterCount }) => ({ id, chapterCount }))).toEqual([
		{ id: "episode-1", chapterCount: 0 },
		{ id: "episode-2", chapterCount: 4 },
	])
	expect(sentQueries).toHaveLength(1)
})

// a published podcast episode of one public topic, with its row and its topic, numbered
function toPodcastEpisodeRowTopic(podcastEpisodeId: string, episodeNumber: number): PodcastEpisodeRowTopic {
	return {
		podcastEpisodeRow: {
			id: podcastEpisodeId,
			topicId: "topic-1",
			scanId: null,
			status: "published",
			title: `Episode ${episodeNumber}`,
			description: null,
			season: 2026,
			episodeNumber,
			audioKey: null,
			audioByteSize: null,
			durationSeconds: 600,
			publishedAt: new Date("2026-10-03T12:00:00.000Z"),
		},
		topic: { id: "topic-1", name: "Agents", visibility: "public" },
	}
}
