// publish tests: a recording publishes only while its row still reads recording. a row that failed before the publish
// read it, or between that read and the save, publishes nothing and keeps no audio. a row that an overlapping attempt
// published keeps its audio
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import * as podcastFeedCache from "@carlnotes/db/podcastFeedCache"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import * as store from "@carlnotes/db/store"
import * as telemetry from "@carlnotes/models/telemetry"
import { publishPodcastEpisode } from "./publishPodcastEpisode"

// put back the connection pool and the module mocks after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a script of one chapter, and the publish of that chapter's recording
const SCRIPT = {
	coldOpen: [],
	segments: [{ transition: [], chapters: [{ findingId: "finding-1", title: "A quieter grinder", turns: [] }] }],
	signOff: [],
}
const PUBLISH_OPTIONS = {
	podcastEpisodeId: "episode-1",
	plannedFindings: [{ findingId: "finding-1", resourceId: "resource-1", sourceUrl: "https://example.com/grinder" }],
	encodedPodcastEpisode: {
		audioKey: "episodes/episode-1/audio.mp3",
		audioByteSize: 1000,
		durationSeconds: 60,
		chapterTimes: [{ startSeconds: 0, endSeconds: 60 }],
	},
	speechTier: "standard",
	chapterAttemptCounts: [1],
	recordedChapterPositions: [0],
}

// the row as the publish reads it, at a status
function toPodcastEpisodeRow(status: string): unknown[] {
	return toTableRow(podcastEpisodes, {
		id: "episode-1",
		topicId: "topic-1",
		scanId: "scan-1",
		status,
		script: SCRIPT,
		cost: "0.2",
		createdAt: new Date(),
	})
}

// stub the pool so the publish reads the row at a status, its publishing update changes a row or none, and a read of
// the status after an update that changed none finds the status the row stopped at. the store, the feed cache, and the
// trace are spied on, so nothing leaves the process
function stubPublish(
	status: string,
	isRowStillRecording: boolean,
	stoppedStatus = "failed",
): { sentQueries: SentQuery[]; deletedKeys: string[] } {
	const sentQueries = stubConnectionPool(({ text }) => {
		// the publishing update returns its row only while the row is still recording
		if (text.startsWith('update "episodes"')) {
			return isRowStillRecording ? [["episode-1"]] : []
		}

		// the status read after an update that changed no row, then the publish's first read of the row, then the Topic
		if (text.startsWith('select "status" from "episodes"')) {
			return [[stoppedStatus]]
		}
		if (text.includes('from "episodes"') && text.includes('"episodes"."id" = ')) {
			return [toPodcastEpisodeRow(status)]
		}
		return text.includes('from "topics"') ? [toTableRow(topics, { id: "topic-1", visibility: "private" })] : []
	})

	// keep the deleted keys, and leave the feed cache and the trace untouched
	const deletedKeys: string[] = []
	spyOn(store, "deleteStoredObjects").mockImplementation(async (objectKeys) => {
		deletedKeys.push(...objectKeys)
	})
	spyOn(podcastFeedCache, "deletePodcastFeedCache").mockResolvedValue(undefined)
	spyOn(telemetry, "tracePodcastEpisodeRecording").mockResolvedValue(undefined)
	return { sentQueries, deletedKeys }
}

// the audio that the recording stored: the finished file, and its one chapter
const RECORDED_AUDIO_KEYS = ["episodes/episode-1/audio.mp3", store.toPodcastEpisodeChapterKey("episode-1", 0)]

test("a recording row publishes through an update that names the recording status", async () => {
	const { sentQueries, deletedKeys } = stubPublish("recording", true)
	await publishPodcastEpisode(PUBLISH_OPTIONS)

	// the update publishes only a row that still reads recording, and its chapters are written after it
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	const publishIndex = queryTexts.findIndex((text) => text.startsWith('update "episodes"'))
	const chaptersIndex = queryTexts.findIndex((text) => text.startsWith('insert into "episode_chapters"'))
	expect(queryTexts[publishIndex]).toMatch(/where \("episodes"\."id" = \$\d+ and "episodes"\."status" = \$\d+\)/)
	expect(sentQueries[publishIndex]?.values).toContain("recording")
	expect(chaptersIndex).toBeGreaterThan(publishIndex)

	// the published chapter's temporary audio goes, and the finished file stays
	expect(deletedKeys).toEqual([store.toPodcastEpisodeChapterKey("episode-1", 0)])
})

test("a late publish never writes over a failed row", async () => {
	const { sentQueries, deletedKeys } = stubPublish("failed", false)
	await publishPodcastEpisode(PUBLISH_OPTIONS)

	// nothing is written, and the audio that the recording stored after the row failed goes
	expect(sentQueries.some((sentQuery) => /^(update|insert)/.test(sentQuery.text))).toBe(false)
	expect(deletedKeys).toEqual(RECORDED_AUDIO_KEYS)
})

// the reaper may fail the row after the publish read it as recording
test("a row that stops recording between the publish's read and its save publishes nothing", async () => {
	const { sentQueries, deletedKeys } = stubPublish("recording", false)
	await publishPodcastEpisode(PUBLISH_OPTIONS)

	// the update changed no row, so no chapter is written and the feed is not told of a new podcast episode
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "episode_chapters"'))).toBe(false)
	expect(podcastFeedCache.deletePodcastFeedCache).not.toHaveBeenCalled()
	expect(deletedKeys).toEqual(RECORDED_AUDIO_KEYS)
})

test("a retry after a saved publish writes nothing and keeps the published audio", async () => {
	const { sentQueries, deletedKeys } = stubPublish("published", false)
	await publishPodcastEpisode(PUBLISH_OPTIONS)
	expect(sentQueries.some((sentQuery) => /^(update|insert)/.test(sentQuery.text))).toBe(false)
	expect(deletedKeys).toEqual([])
})

// a publish attempt that outlives its timeout may still save while its retry runs. the retry reads the row as
// recording, and its update finds the row the first attempt published
test("a publish that an overlapping attempt saved first keeps the published audio", async () => {
	const { sentQueries, deletedKeys } = stubPublish("recording", false, "published")
	await publishPodcastEpisode(PUBLISH_OPTIONS)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "episode_chapters"'))).toBe(false)
	expect(deletedKeys).toEqual([])
})
