// queued and in-flight recordings recheck lasting personal sources activation before work and publication
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { planPodcastEpisode } from "./planPodcastEpisode"
import { assertPodcastPersonalSourcesConverted } from "./podcastPersonalSourcesMigration"
import { publishPodcastEpisode } from "./publishPodcastEpisode"
import { outlinePodcastEpisode } from "./writePodcastEpisodeScript"

// environment and rows are local to these fixtures
const restoreEnvSettings = saveEnvSettings(["PODCAST_SPEECH_MODEL"])
afterEach(() => {
	restoreEnvSettings()
	restoreConnectionPool()
})

test("an activated Topic refuses a queued plan even if its old podcast flag is true", async () => {
	Bun.env.PODCAST_SPEECH_MODEL = "fixture-speech"
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "scans"')) {
			return [["succeeded"]]
		}
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic", isPodcastEnabled: true })]
		}
		if (text.includes('from "topic_personal_source_contexts"')) {
			return [["topic"]]
		}
		return []
	})
	expect(await planPodcastEpisode({ scanId: "scan", topicId: "topic", billedUserId: "owner" })).toBeNull()
	expect(queries.some(({ text }) => text.startsWith("insert"))).toBe(false)
})

test("script and audio guards reject activated or deleted Topics while ordinary Topics remain available", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "topic_personal_source_contexts"') ? [["topic"]] : [["topic"]]))
	await expect(
		outlinePodcastEpisode({
			podcastEpisodeId: "episode",
			topicId: "topic",
			billedUserId: "owner",
			plannedFindings: [],
		}),
	).rejects.toThrow("being upgraded")
	await expect(assertPodcastPersonalSourcesConverted({ podcastEpisodeId: "episode" })).rejects.toThrow("being upgraded")
	stubConnectionPool(() => [])
	await expect(assertPodcastPersonalSourcesConverted({ podcastEpisodeId: "deleted" })).rejects.toThrow("being upgraded")
	await expect(assertPodcastPersonalSourcesConverted({ topicId: "ordinary" })).resolves.toBeUndefined()
})

test("activation between the episode read and publication cannot publish or index audio", async () => {
	// the recording was planned before activation, and the activation row exists by the Topic lock
	const script = {
		coldOpen: [],
		signOff: [],
		segments: [
			{
				transition: [],
				chapters: [
					{ findingId: "finding", title: "Public article", turns: [{ speaker: "host", text: "Public discussion" }] },
				],
			},
		],
	}
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "episodes"')) {
			return [
				toTableRow(podcastEpisodes, {
					id: "episode",
					topicId: "topic",
					status: "recording",
					script,
					createdAt: new Date().toISOString(),
				}),
			]
		}
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic" })]
		}
		if (text.includes('from "topic_personal_source_contexts"')) {
			return [["topic"]]
		}
		return []
	})
	await expect(
		publishPodcastEpisode({
			podcastEpisodeId: "episode",
			plannedFindings: [{ findingId: "finding", resourceId: "resource", sourceUrl: "https://example.org/article" }],
			encodedPodcastEpisode: {
				audioKey: "fixture",
				audioByteSize: 1,
				durationSeconds: 10,
				chapterTimes: [{ startSeconds: 0, endSeconds: 10 }],
			},
			speechTier: "standard",
			chapterAttemptCounts: [1],
			recordedChapterPositions: [0],
		}),
	).rejects.toThrow("being upgraded")
	expect(queries.some(({ text }) => text.includes('from "topics"') && text.includes("for no key update"))).toBe(true)
	expect(queries.some(({ text }) => /^(insert|update|delete)/.test(text))).toBe(false)
})
