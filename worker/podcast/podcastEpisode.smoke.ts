// a live smoke test for a Podcast Episode. plan it for a seeded Scan, write its script, render and join its chapters,
// publish it, and remove it, through the same functions that the podcast episode workflow's activities run.
// run it with: bun run smoke:podcast-episode. it needs the LiteLLM proxy from bun run carl-up with GEMINI_API_KEY,
// object storage, and ffmpeg
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { canRenderPodcastEpisode, monthlySpendDollars } from "../../db/quotas"
import { findings, podcastEpisodeChapters, podcastEpisodes, resources, scans, topics, users } from "../../db/schema"
import { attachmentExists, toPodcastEpisodeAudioKey, toPodcastEpisodeChapterKey } from "../store"
import { shutdownTelemetry, startTelemetry } from "../telemetry"
import { planPodcastEpisode } from "./planPodcastEpisode"
import { encodePodcastEpisode, renderPodcastEpisodeChapter } from "./podcastEpisodeAudio"
import { toScriptMinutes } from "./podcastEpisodeScript"
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
type SeededRowIds = { userId: string; topicId: string; scanId: string; resourceIds: string[] }

// seed a free user with a Topic, a succeeded Scan, and two Findings on Resources that only this run uses
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
	const [scan] = await db.insert(scans).values(scanValues).returning()
	if (!topic || !scan) {
		throw new Error("failed to seed the topic or its scan")
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
	return {
		userId: user.id,
		topicId: topic.id,
		scanId: scan.id,
		resourceIds: resourceRows.map((resourceRow) => resourceRow.id),
	}
}

// run a Podcast Episode from its plan to its removal, check each step, and print a report.
// returns true if every check passes
async function check({ userId, topicId, scanId }: SeededRowIds): Promise<boolean> {
	// plan the Podcast Episode that the free plan gives the Topic
	const planPodcastEpisodeOptions = { scanId, topicId, billedUserId: userId }
	const podcastEpisodePlan = await planPodcastEpisode(planPodcastEpisodeOptions)
	if (!podcastEpisodePlan) {
		console.log("FAIL  the scan planned no episode")
		return false
	}

	// ask whether the free Topic may render another Podcast Episode while the planned Podcast Episode renders
	const canRenderWhileRendering = await canRenderPodcastEpisode({ id: topicId, ownerId: userId })

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

	// write each segment, save the script, and render each chapter on the standard tier
	const segments = await Promise.all(
		outline.segments.map((_, segmentIndex) =>
			writePodcastEpisodeSegment({ ...scriptCallOptions, outline, segmentIndex }),
		),
	)
	const chapterCount = await savePodcastEpisodeScript(podcastEpisodeId, segments)
	const chapterPositions = Array.from({ length: chapterCount }, (_, position) => position)
	const renderedChapters = await Promise.all(
		chapterPositions.map((position) =>
			renderPodcastEpisodeChapter({ podcastEpisodeId, billedUserId: userId, position, speechTier: "standard" }),
		),
	)

	// join the chapters, publish, and read back what was saved
	const encodedPodcastEpisode = await encodePodcastEpisode(podcastEpisodeId, renderedChapters)
	const chapterAttemptCounts = renderedChapters.map(() => 1)
	await publishPodcastEpisode({
		podcastEpisodeId,
		plannedFindings,
		encodedPodcastEpisode,
		speechTier: "standard",
		chapterAttemptCounts,
		renderedChapterPositions: renderedChapters.map((renderedChapter) => renderedChapter.position),
	})

	// the row and its chapter rows as the publish left them
	const [publishedPodcastEpisode] = await db
		.select()
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	const podcastEpisodeChapterRows = await db
		.select()
		.from(podcastEpisodeChapters)
		.where(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId))

	// whether the audio is stored and the chapter audio is gone, and what the script and the audio measure
	const isAudioStored = await attachmentExists(toPodcastEpisodeAudioKey(podcastEpisodeId))
	const isChapterAudioLeft = await attachmentExists(toPodcastEpisodeChapterKey(podcastEpisodeId, 0))
	const scriptMinutes = publishedPodcastEpisode?.script ? toScriptMinutes(publishedPodcastEpisode.script) : 0
	const { durationSeconds, audioByteSize } = encodedPodcastEpisode
	console.log(`script: ${scriptMinutes.toFixed(1)} min, audio: ${durationSeconds}s, ${audioByteSize} bytes`)
	console.log(`cost: $${publishedPodcastEpisode?.cost}`)
	console.log(`chapters: ${chapterCount} for ${plannedFindings.length} findings`)

	// plan the same Scan again, and ask whether the free Topic may render another Podcast Episode
	const secondPodcastEpisodePlan = await planPodcastEpisode(planPodcastEpisodeOptions)
	const canRenderAnotherPodcastEpisode = await canRenderPodcastEpisode({ id: topicId, ownerId: userId })

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
		["a rendering episode uses the topic's one free-plan episode", !canRenderWhileRendering],
		["the title was saved while the episode was rendering", outlinedPodcastEpisode?.status === "rendering"],
		["the saved title is the outline's", outlinedPodcastEpisode?.title === outline.title],

		// the script and the audio. a last draft may leave a chapter out, so the script has one chapter or two
		["the script has a chapter for one finding or both", chapterCount >= 1 && chapterCount <= plannedFindings.length],
		["a short input made a short script", scriptMinutes > 0.5 && scriptMinutes < 7],
		["the audio is stored", isAudioStored],
		["the chapters' audio was deleted", !isChapterAudioLeft],
		["the audio is about 8 kilobytes a second", Math.abs(audioByteSize / durationSeconds - 8_000) < 800],

		// the publish
		["the episode is published", publishedPodcastEpisode?.status === "published"],
		["its season is this year", publishedPodcastEpisode?.season === new Date().getUTCFullYear()],
		["its episode number is 1", publishedPodcastEpisode?.episodeNumber === 1],
		["it has a chapter row for each chapter", podcastEpisodeChapterRows.length === chapterCount],
		[
			"the chapters cover the episode",
			Math.round(podcastEpisodeChapterRows.at(-1)?.endSeconds ?? 0) === durationSeconds,
		],
		["its cost was recorded", Number(publishedPodcastEpisode?.cost) > 0],

		// the checks after a publish
		["the scan plans no second episode", secondPodcastEpisodePlan === null],
		["a published episode uses the topic's one free-plan episode", !canRenderAnotherPodcastEpisode],

		// the removal
		["the episode was removed", isPodcastEpisodeRemoved && removedPodcastEpisode?.status === "removed"],
		[
			"its episode number and its cost stay",
			removedPodcastEpisode?.episodeNumber === 1 && Number(removedPodcastEpisode?.cost) > 0,
		],
		[
			"its script, its chapters, and its audio are gone",
			!removedPodcastEpisode?.script && removedChapterRows.length === 0,
		],
		["its audio object is gone", !isAudioLeft],
		["its cost still counts in the month's spend", monthlySpend.podcastEpisodeDollars > 0],
		[
			"a removed episode frees the topic's one free-plan episode",
			await canRenderPodcastEpisode({ id: topicId, ownerId: userId }),
		],
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
