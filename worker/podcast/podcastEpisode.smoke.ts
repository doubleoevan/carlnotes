// a live smoke test for a free Topic's short Podcast Episode. plan it for a seeded Scan, write its script, record and
// join its chapters, publish it in place of the Topic's earlier short one, and remove it, through the same functions
// that the podcast episode workflow's activities run.
// run it with: bun run smoke:podcast-episode. it needs the LiteLLM proxy from bun run carl-up with GEMINI_API_KEY,
// object storage, and ffmpeg
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { monthlySpendDollars } from "../../db/quotas"
import { findings, podcastEpisodeChapters, podcastEpisodes, resources, scans, topics, users } from "../../db/schema"
import { attachmentExists, toPodcastEpisodeAudioKey, toPodcastEpisodeChapterKey } from "../store"
import { shutdownTelemetry, startTelemetry } from "../telemetry"
import { planPodcastEpisode } from "./planPodcastEpisode"
import { encodePodcastEpisode, recordPodcastEpisodeChapter } from "./podcastEpisodeAudio"
import { toScriptMinutes } from "./podcastEpisodeScript"
import { loadThemeClips, toThemedEpisodeTimes } from "./podcastEpisodeTheme"
import { publishPodcastEpisode } from "./publishPodcastEpisode"
import { removePodcastEpisode } from "./removePodcastEpisode"
import {
	outlinePodcastEpisode,
	savePodcastEpisodeScript,
	writePodcastEpisodeSegment,
} from "./writePodcastEpisodeScript"

// two Findings worth a short Podcast Episode, each with its Resource's title and snippet and its relevance explanation
const SEEDED_FINDINGS = [
	{
		title: "A quieter burr set for home grinders",
		snippet: "A grinder maker released a burr set that runs at 62 decibels, about a third quieter than its last one.",
		relevanceExplanation:
			"The reader grinds before the house is awake, so a quieter grinder is the upgrade they asked about.",
	},
	{
		title: "Hard water and sour espresso",
		snippet: "A water lab measured extraction at three hardness levels and found that very hard water mutes acidity.",
		relevanceExplanation: "The reader's shots turned sour after a move, and the new city's water is much softer.",
	},
]

// the ids of the seeded rows that the checks read and the cleanup deletes
type SeededRowIds = {
	userId: string
	topicId: string
	scanId: string
	resourceIds: string[]
	// a second succeeded Scan, and the Topic's earlier published short and full Podcast Episodes
	secondScanId: string
	earlierShortPodcastEpisodeId: string
	earlierFullPodcastEpisodeId: string
}

// seed a free user with a Topic, two succeeded Scans, two Findings on Resources that only this run uses,
// and the Topic's earlier short and full Podcast Episodes
async function seedTestData(): Promise<SeededRowIds> {
	const runId = crypto.randomUUID().slice(0, 8)
	const [user] = await db
		.insert(users)
		.values({
			name: "episode-smoke",
			email: `delivered+episode-smoke-${runId}@resend.dev`,
			username: `episode-smoke-${runId}`,
			usernameNormalized: `episodesmoke${runId}`,
		})
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}

	// the Topic and the Scan that the Podcast Episode is planned for
	const topicValues = { ownerId: user.id, name: "Home espresso", prompt: "Gear and technique for espresso at home." }
	const [topic] = await db.insert(topics).values(topicValues).returning()
	const scanValues = { topicId: topic?.id, ownerId: user.id, status: "succeeded" as const, finishedAt: new Date() }
	const [scan, secondScan] = await db.insert(scans).values([scanValues, scanValues]).returning()
	if (!topic || !scan || !secondScan) {
		throw new Error("failed to seed the topic or its scans")
	}

	// one Resource and one Finding for each seeded Finding, the first scored higher
	const resourceRows = await db
		.insert(resources)
		.values(
			SEEDED_FINDINGS.map(({ title, snippet }, i) => ({
				url: `https://episode-smoke.example/${runId}/${i}`,
				kind: "read" as const,
				title,
				snippet,
			})),
		)
		.returning({ id: resources.id })
	await db.insert(findings).values(
		resourceRows.map((resourceRow, i) => ({
			topicId: topic.id,
			resourceId: resourceRow.id,
			scanId: scan.id,
			relevanceScore: 0.9 - i * 0.1,
			relevanceExplanation: SEEDED_FINDINGS[i]?.relevanceExplanation ?? "",
		})),
	)

	// the Topic's earlier published short and full Podcast Episodes, numbers 1 and 2 this season
	const earlierPodcastEpisodeValues = { topicId: topic.id, ownerId: user.id, status: "published" as const }
	const season = new Date().getUTCFullYear()
	const [earlierShortPodcastEpisode, earlierFullPodcastEpisode] = await db
		.insert(podcastEpisodes)
		.values([
			{ ...earlierPodcastEpisodeValues, isShort: true, season, episodeNumber: 1, title: "Earlier short episode" },
			{ ...earlierPodcastEpisodeValues, isShort: false, season, episodeNumber: 2, title: "Earlier full episode" },
		])
		.returning({ id: podcastEpisodes.id })
	if (!earlierShortPodcastEpisode || !earlierFullPodcastEpisode) {
		throw new Error("failed to seed the earlier episodes")
	}

	// a Resource that only the earlier short Podcast Episode narrated, and no seeded Finding has
	const earlierNarratedUrl = `https://episode-smoke.example/${runId}/earlier`
	const [earlierNarratedResourceRow] = await db
		.insert(resources)
		.values({ url: earlierNarratedUrl, kind: "read", title: "An earlier finding" })
		.returning({ id: resources.id })
	if (!earlierNarratedResourceRow) {
		throw new Error("failed to seed the earlier episode's resource")
	}

	// the earlier short Podcast Episode's chapter, which narrated that Resource
	await db.insert(podcastEpisodeChapters).values({
		podcastEpisodeId: earlierShortPodcastEpisode.id,
		position: 0,
		resourceId: earlierNarratedResourceRow.id,
		title: "An earlier finding",
		sourceUrl: earlierNarratedUrl,
		startSeconds: 0,
		endSeconds: 60,
	})
	return {
		userId: user.id,
		topicId: topic.id,
		scanId: scan.id,
		secondScanId: secondScan.id,
		resourceIds: [...resourceRows.map((resourceRow) => resourceRow.id), earlierNarratedResourceRow.id],
		earlierShortPodcastEpisodeId: earlierShortPodcastEpisode.id,
		earlierFullPodcastEpisodeId: earlierFullPodcastEpisode.id,
	}
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
			recordPodcastEpisodeChapter({ podcastEpisodeId, billedUserId: userId, position, speechTier: "standard" }),
		),
	)

	// join the chapters, publish, and read back what was saved
	const encodedPodcastEpisode = await encodePodcastEpisode(podcastEpisodeId, recordedChapters)
	const chapterAttemptCounts = recordedChapters.map(() => 1)
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

	// whether any audio is left, and the user's spend this month
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

		// the checks after a publish
		["the scan plans no second episode", secondPodcastEpisodePlan === null],
		[
			"the earlier short episode was replaced and kept its chapter",
			earlierShortPodcastEpisode?.status === "removed" && earlierShortChapterRows.length === 1,
		],
		["the earlier full episode stays published", earlierFullPodcastEpisode?.status === "published"],

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
