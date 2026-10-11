// a live smoke test for a free Topic's short Podcast Episode, through the workflow's own activity functions: plan,
// script, record, publish, and remove it. bun run smoke:podcast-episode needs carl-up, GEMINI_API_KEY, S3, and ffmpeg
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { monthlySpendDollars } from "../../db/quotas"
import { podcastEpisodeChapters, podcastEpisodes } from "../../db/schema/podcast"
import { resources } from "../../db/schema/scans"
import { users } from "../../db/schema/users"
import { runWithRetries } from "../retry"
import { attachmentExists, toPodcastEpisodeAudioKey, toPodcastEpisodeChapterKey } from "../store"
import { shutdownTelemetry, startTelemetry } from "../telemetry"
import type { RecordedChapterAttempt } from "../workflows/recordPodcastEpisodeActivities"
import { planPodcastEpisode } from "./planPodcastEpisode"
import {
	encodePodcastEpisode,
	type RecordPodcastEpisodeChapterOptions,
	recordPodcastEpisodeChapter,
	SpeechFailedError,
} from "./podcastEpisodeAudio"
import { toScriptMinutes } from "./podcastEpisodeScript"
import { loadPodcastEpisodeVectorRows, type SeededRowIds, seedTestData } from "./podcastEpisodeSmokeFixtures"
import { loadThemeClips, toThemedEpisodeTimes } from "./podcastEpisodeTheme"
import { publishPodcastEpisode } from "./publishPodcastEpisode"
import { removePodcastEpisode } from "./removePodcastEpisode"
import {
	outlinePodcastEpisode,
	savePodcastEpisodeScript,
	writePodcastEpisodeSegment,
} from "./writePodcastEpisodeScript"

// how many times to record a chapter, and how long to wait between attempts
const CHAPTER_ATTEMPTS = 3
const CHAPTER_RETRY_DELAY_MS = 30 * 1000

// record a chapter, retrying a speech failure that another attempt can fix, as the podcast episode workflow does
function recordPodcastEpisodeChapterWithRetries(
	recordPodcastEpisodeChapterOptions: RecordPodcastEpisodeChapterOptions,
): Promise<RecordedChapterAttempt> {
	return runWithRetries({
		attempts: CHAPTER_ATTEMPTS,
		delayMs: CHAPTER_RETRY_DELAY_MS,
		// record the chapter, and note which attempt recorded it
		runAttempt: async (attempt) => {
			const recordedChapter = await recordPodcastEpisodeChapter(recordPodcastEpisodeChapterOptions)
			return { ...recordedChapter, attemptCount: attempt }
		},
		isRetryable: (error) => error instanceof SpeechFailedError && error.isRetryable,
		onRetry: (attempt) =>
			console.log(
				`chapter ${recordPodcastEpisodeChapterOptions.position} failed on attempt ${attempt}, so it records again`,
			),
	})
}

// run a Podcast Episode from its plan to its removal, check each step, and print a report.
// returns true if every check passes
async function check({
	userId,
	topicId,
	scanId,
	secondScanId,
	earlierShortPodcastEpisodeId,
	earlierFullPodcastEpisodeId,
}: SeededRowIds): Promise<boolean> {
	// plan the short Podcast Episode that the free plan gives the Topic
	const planPodcastEpisodeOptions = { scanId, topicId, billedUserId: userId }
	const podcastEpisodePlan = await planPodcastEpisode(planPodcastEpisodeOptions)
	if (!podcastEpisodePlan) {
		console.log("FAIL  the scan planned no episode")
		return false
	}

	// plan the second Scan's Podcast Episode while the first short one is recording
	const secondScanPodcastEpisodePlan = await planPodcastEpisode({ scanId: secondScanId, topicId, billedUserId: userId })

	// the Podcast Episode's row and the Findings that it narrates
	const { podcastEpisodeId, plannedFindings } = podcastEpisodePlan
	const scriptCallOptions = { podcastEpisodeId, topicId, billedUserId: userId, plannedFindings }

	// write the outline, and read the row back before any audio exists
	const outline = await outlinePodcastEpisode(scriptCallOptions)
	const [outlinedPodcastEpisode] = await db
		.select()
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	console.log(`title: ${outline.title}\ndescription: ${outline.description}`)

	// write each segment, save the script, and record each chapter on the standard tier
	const segments = await Promise.all(
		outline.segments.map((_, segmentIndex) =>
			writePodcastEpisodeSegment({ ...scriptCallOptions, outline, segmentIndex }),
		),
	)
	const chapterCount = await savePodcastEpisodeScript(podcastEpisodeId, segments)
	const chapterPositions = Array.from({ length: chapterCount }, (_, position) => position)
	const recordedChapters = await Promise.all(
		chapterPositions.map((position) =>
			recordPodcastEpisodeChapterWithRetries({
				podcastEpisodeId,
				billedUserId: userId,
				position,
				speechTier: "standard",
			}),
		),
	)

	// join the chapters, publish, and read back what was saved
	const encodedPodcastEpisode = await encodePodcastEpisode(podcastEpisodeId, recordedChapters)
	const chapterAttemptCounts = recordedChapters.map((recordedChapter) => recordedChapter.attemptCount)
	await publishPodcastEpisode({
		podcastEpisodeId,
		plannedFindings,
		encodedPodcastEpisode,
		speechTier: "standard",
		chapterAttemptCounts,
		recordedChapterPositions: recordedChapters.map((recordedChapter) => recordedChapter.position),
	})

	// the row as the publish left it
	const [publishedPodcastEpisode] = await db
		.select()
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))

	// the chapter rows in their order
	const podcastEpisodeChapterRows = await db
		.select()
		.from(podcastEpisodeChapters)
		.where(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId))
		.orderBy(podcastEpisodeChapters.position)

	// the published Podcast Episode's vector and the replaced short one's
	const publishedVectorRows = await loadPodcastEpisodeVectorRows(podcastEpisodeId)
	const earlierShortVectorRows = await loadPodcastEpisodeVectorRows(earlierShortPodcastEpisodeId)

	// the episode's length that the theme gives the chapters' talk, measured from the first chapter's start
	const talkStartSeconds = podcastEpisodeChapterRows[0]?.startSeconds ?? 0
	const talkChapterTimes = podcastEpisodeChapterRows.map(({ startSeconds, endSeconds }) => ({
		startSeconds: startSeconds - talkStartSeconds,
		endSeconds: endSeconds - talkStartSeconds,
	}))
	const themedDurationSeconds = toThemedEpisodeTimes(talkChapterTimes, await loadThemeClips()).durationSeconds

	// whether the audio is stored and the chapter audio is gone, and what the script and the audio measure
	const isAudioStored = await attachmentExists(toPodcastEpisodeAudioKey(podcastEpisodeId))
	const isChapterAudioLeft = await attachmentExists(toPodcastEpisodeChapterKey(podcastEpisodeId, 0))
	const scriptMinutes = publishedPodcastEpisode?.script ? toScriptMinutes(publishedPodcastEpisode.script) : 0
	const { durationSeconds, audioByteSize } = encodedPodcastEpisode
	console.log(`script: ${scriptMinutes.toFixed(1)} min, audio: ${durationSeconds}s, ${audioByteSize} bytes`)
	console.log(`cost: $${publishedPodcastEpisode?.cost}`)
	console.log(`chapters: ${chapterCount} for ${plannedFindings.length} findings`)

	// plan the same Scan again
	const secondPodcastEpisodePlan = await planPodcastEpisode(planPodcastEpisodeOptions)

	// the earlier Podcast Episodes as the publish left them
	const [earlierShortPodcastEpisode] = await db
		.select()
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, earlierShortPodcastEpisodeId))
	const [earlierFullPodcastEpisode] = await db
		.select()
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, earlierFullPodcastEpisodeId))

	// the earlier short Podcast Episode's chapter rows, which a replacement keeps
	const earlierShortChapterRows = await db
		.select()
		.from(podcastEpisodeChapters)
		.where(eq(podcastEpisodeChapters.podcastEpisodeId, earlierShortPodcastEpisodeId))

	// remove the Podcast Episode
	const isPodcastEpisodeRemoved = await removePodcastEpisode(podcastEpisodeId)

	// the row and the chapter rows that are left
	const [removedPodcastEpisode] = await db
		.select()
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	const removedChapterRows = await db
		.select()
		.from(podcastEpisodeChapters)
		.where(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId))

	// whether the removed Podcast Episode's vector or any audio is left, and the user's spend this month
	const removedVectorRows = await loadPodcastEpisodeVectorRows(podcastEpisodeId)
	const isAudioLeft = await attachmentExists(toPodcastEpisodeAudioKey(podcastEpisodeId))
	const monthlySpend = await monthlySpendDollars(userId)

	const results: [string, boolean][] = [
		// the plan and the outline
		["both findings were planned, the scan's best first", plannedFindings.length === 2],
		["a free topic's episode is short", outlinedPodcastEpisode?.isShort === true],
		["a second brew during the short recording plans no episode", secondScanPodcastEpisodePlan === null],
		["the title was saved while the episode was recording", outlinedPodcastEpisode?.status === "recording"],
		["the saved title is the outline's", outlinedPodcastEpisode?.title === outline.title],

		// the script and the audio. a last draft may leave a chapter out, so the script has one chapter or two
		["the script has a chapter for one finding or both", chapterCount >= 1 && chapterCount <= plannedFindings.length],
		["a short input made a script within the short episode's minutes", scriptMinutes > 0.5 && scriptMinutes < 10],
		["the audio is stored", isAudioStored],
		["the chapters' audio was deleted", !isChapterAudioLeft],
		["the audio is about 8 kilobytes a second", Math.abs(audioByteSize / durationSeconds - 8_000) < 800],

		// the publish
		["the episode is published", publishedPodcastEpisode?.status === "published"],
		["its season is this year", publishedPodcastEpisode?.season === new Date().getUTCFullYear()],
		["its episode number is 3", publishedPodcastEpisode?.episodeNumber === 3],
		["it has a chapter row for each chapter", podcastEpisodeChapterRows.length === chapterCount],
		["the chapters and the theme cover the episode", Math.round(themedDurationSeconds) === durationSeconds],
		["its cost was recorded", Number(publishedPodcastEpisode?.cost) > 0],
		["its vector was saved from its chapters", publishedVectorRows.length === 1],
		[
			"its vector saved its private topic as not public and shown",
			publishedVectorRows[0]?.isTopicPublicAndShown === false,
		],

		// the checks after a publish
		["the scan plans no second episode", secondPodcastEpisodePlan === null],
		[
			"the earlier short episode was replaced and kept its chapter",
			earlierShortPodcastEpisode?.status === "removed" && earlierShortChapterRows.length === 1,
		],
		["the earlier full episode stays published", earlierFullPodcastEpisode?.status === "published"],
		["the earlier short episode's vector was deleted", earlierShortVectorRows.length === 0],

		// the removal
		["the episode was removed", isPodcastEpisodeRemoved && removedPodcastEpisode?.status === "removed"],
		[
			"its episode number and its cost stay",
			removedPodcastEpisode?.episodeNumber === 3 && Number(removedPodcastEpisode?.cost) > 0,
		],
		[
			"its script, its chapters, and its audio are gone",
			!removedPodcastEpisode?.script && removedChapterRows.length === 0,
		],
		["its audio object is gone", !isAudioLeft],
		["its vector is gone", removedVectorRows.length === 0],
		["its cost still counts in the month's spend", monthlySpend.podcastEpisodeDollars > 0],
	]

	// print each check and return the overall result
	let isTestPassing = true
	for (const [label, isPassed] of results) {
		console.log(`${isPassed ? "PASS" : "FAIL"}  ${label}`)
		isTestPassing = isTestPassing && isPassed
	}
	return isTestPassing
}

// seed, run the checks, and delete what was seeded no matter how the checks end
async function smokeTest(): Promise<number> {
	const seededRowIds = await seedTestData()
	try {
		const isPassed = await check(seededRowIds)
		console.log(`\n=== smoke ${isPassed ? "PASSED" : "FAILED"} ===`)
		return isPassed ? 0 : 1
	} finally {
		// the user's delete cascades to the Topic, the Scan, the Findings, and the Podcast Episode.
		// the Resources are global
		await db.delete(users).where(eq(users.id, seededRowIds.userId))
		await Promise.all(
			seededRowIds.resourceIds.map((resourceId) => db.delete(resources).where(eq(resources.id, resourceId))),
		)
	}
}

// run the smoke test, computing the exit code instead of exiting early so telemetry can flush first
startTelemetry()
let exitCode: number
try {
	exitCode = await smokeTest()
} catch (error) {
	console.error(error)
	exitCode = 1
}

// flush telemetry, then report the outcome as the exit code
await shutdownTelemetry()
process.exitCode = exitCode
