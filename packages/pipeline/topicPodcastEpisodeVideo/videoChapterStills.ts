// each chapter's still in a podcast episode film: its Finding's link preview image, or an imagined image for a long
// chapter with none, or the podcast card. an imagined image is drawn in the film house style from the Finding's title
// and public relevance explanation, checked by the image moderation, stored beside the film's parts, and billed like
// the film's own image. any failure leaves the chapter on the podcast card

import { join } from "node:path"
import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { findings, resources } from "@carlnotes/db/schema/scans"
import {
	attachmentExists,
	getAttachmentBytes,
	toTopicPodcastEpisodeVideoChapterImageKey,
	uploadAttachment,
} from "@carlnotes/db/store"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { classifyImage } from "@carlnotes/models/moderation"
import { topicImageCostDollars, topicImageModel } from "@carlnotes/models/topicImageModel"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { reportError } from "@carlnotes/server/monitoring"
import { imaginedChapterImageLimit, imaginedChapterImageMinimumSeconds } from "@carlnotes/server/podcastEpisodeSettings"
import { and, eq, inArray, sql } from "drizzle-orm"
import { toImageDataUri } from "../cardElementPng"
import type { TopicImageSceneInput } from "../topicImages/writeTopicImageScene"
import { drawTopicPodcastEpisodeVideoImageOriginal } from "./topicPodcastEpisodeVideoImage"
import {
	loadChapterLinkPreviewStillPng,
	toChapterLowerThirdText,
	type VideoChapterRow,
} from "./topicPodcastEpisodeVideoInputs"
import { loadPodcastCardStillPng, toVideoStillPng } from "./videoFrames"
import type { VideoChapterFrame } from "./videoParts"
import { toSegmentSeconds, type VideoSegment } from "./videoTimeline"

// how many imagined images are drawn at once
const IMAGINED_CHAPTER_IMAGE_DRAW_CONCURRENCY = 4

// the film's podcast episode, its owner, and whether the platform pays for the imagined images, as the backfill does
type ImaginedChapterImageBilling = { podcastEpisodeId: string; ownerId: string; isPlatformBilled: boolean }

// the film's billing, its chapters and timeline, and the folder that the render works in
type PrepareChapterFramesOptions = ImaginedChapterImageBilling & {
	videoChapterRows: VideoChapterRow[]
	segments: VideoSegment[]
	workDirectory: string
}

// one chapter with a safe Resource that runs long enough for an imagined image, and its length in seconds
type LongChapter = { videoChapterRow: VideoChapterRow; seconds: number }

// one long chapter's settled still: its file, and whether it is the Finding's link preview image
type LongChapterStill = { stillPath: string; isLinkPreviewImage: boolean }

// each long chapter's settled still by its position, or null for a long chapter that shows the podcast card
type LongChapterStills = Map<number, LongChapterStill | null>

/**
 * Settles the still of every long chapter before the chapters are encoded, drawing an imagined image for the longest
 * ones with no link preview image, up to the limit. Returns the load of any chapter's frame by its position, which
 * reads a long chapter's settled still once and deletes its file.
 */
export async function prepareChapterFrames({
	videoChapterRows,
	segments,
	workDirectory,
	...imaginedChapterImageBilling
}: PrepareChapterFramesOptions): Promise<(position: number) => Promise<VideoChapterFrame>> {
	// write each long chapter's link preview still, and list the long chapters that have none
	const longChapterStills: LongChapterStills = new Map()
	const imaginableChapters: LongChapter[] = []
	for (const longChapter of toLongChapters(videoChapterRows, segments)) {
		// a long chapter with no link preview image shows the podcast card unless it gets an imagined image
		const { position } = longChapter.videoChapterRow
		const stillPng = await loadChapterLinkPreviewStillPng(longChapter.videoChapterRow)
		const stillPath = stillPng ? await writeLongChapterStill({ workDirectory, position, stillPng }) : null
		longChapterStills.set(position, stillPath ? { stillPath, isLinkPreviewImage: true } : null)
		if (!stillPath) {
			imaginableChapters.push(longChapter)
		}
	}

	// the longest of them get an imagined image, up to the limit
	const pickedChapters = imaginableChapters
		.toSorted((firstChapter, secondChapter) => secondChapter.seconds - firstChapter.seconds)
		.slice(0, imaginedChapterImageLimit())
	const imaginedChapterStillPngs = await loadImaginedChapterStillPngs({
		...imaginedChapterImageBilling,
		positions: pickedChapters.map((pickedChapter) => pickedChapter.videoChapterRow.position),
	})

	// write each imagined still in place of its chapter's podcast card
	for (const [position, stillPng] of imaginedChapterStillPngs) {
		const stillPath = await writeLongChapterStill({ workDirectory, position, stillPng })
		longChapterStills.set(position, { stillPath, isLinkPreviewImage: false })
	}
	return (position) => loadChapterFrame({ videoChapterRows, longChapterStills, position })
}

// the chapters with a safe Resource whose segment runs the minimum seconds or longer. a limit of zero turns imagined
// images off, so no chapter is long
function toLongChapters(videoChapterRows: VideoChapterRow[], segments: VideoSegment[]): LongChapter[] {
	if (imaginedChapterImageLimit() === 0) {
		return []
	}

	// each chapter's length from its segment, which holds the gap before the next chapter
	const minimumSeconds = imaginedChapterImageMinimumSeconds()
	const chapterSeconds = new Map<number, number>()
	for (const segment of segments) {
		if (segment.kind === "chapter") {
			chapterSeconds.set(segment.position, toSegmentSeconds(segment.frameCount))
		}
	}

	// keep the safe chapters that run long enough
	return videoChapterRows
		.map((videoChapterRow) => ({ videoChapterRow, seconds: chapterSeconds.get(videoChapterRow.position) ?? 0 }))
		.filter((longChapter) => !longChapter.videoChapterRow.isUnsafe && longChapter.seconds >= minimumSeconds)
}

// the folder that the render works in, the chapter's position, and its still
type WriteLongChapterStillOptions = { workDirectory: string; position: number; stillPng: Uint8Array }

// write one long chapter's still to the work folder, and return its file
async function writeLongChapterStill({
	workDirectory,
	position,
	stillPng,
}: WriteLongChapterStillOptions): Promise<string> {
	const stillPath = join(workDirectory, `long-chapter-${position}-still.png`)
	await Bun.write(stillPath, stillPng)
	return stillPath
}

// the film's chapters, the long chapters' settled stills, and the position of the chapter to load
type LoadChapterFrameOptions = {
	videoChapterRows: VideoChapterRow[]
	longChapterStills: LongChapterStills
	position: number
}

// one chapter's still and lower third, with whether the still is the link preview image. a long chapter's still is
// already settled, and its file is deleted once it is read. any other chapter loads its link preview image or the
// podcast card
async function loadChapterFrame({
	videoChapterRows,
	longChapterStills,
	position,
}: LoadChapterFrameOptions): Promise<VideoChapterFrame> {
	const videoChapterRow = videoChapterRows.find((chapterRow) => chapterRow.position === position)
	if (!videoChapterRow) {
		throw new Error(`the film has no chapter at position ${position}`)
	}

	// read a settled still from its file, and delete the file
	const lowerThirdText = toChapterLowerThirdText(videoChapterRow)
	const longChapterStill = longChapterStills.get(position)
	if (longChapterStill) {
		const { stillPath, isLinkPreviewImage } = longChapterStill
		const stillPng = await Bun.file(stillPath).bytes()
		await Bun.file(stillPath).delete()
		return { stillPng, isLinkPreviewImage, lowerThirdText }
	}

	// a long chapter settled with no still shows the podcast card, and any other chapter loads its link preview image
	// or else the podcast card
	const isPodcastCardSettled = longChapterStill === null
	const linkPreviewStillPng = isPodcastCardSettled ? null : await loadChapterLinkPreviewStillPng(videoChapterRow)
	const stillPng = linkPreviewStillPng ?? (await loadPodcastCardStillPng())
	return { stillPng, isLinkPreviewImage: linkPreviewStillPng !== null, lowerThirdText }
}

// the film's billing, and the positions of the chapters picked for an imagined image
type LoadImaginedChapterStillPngsOptions = ImaginedChapterImageBilling & { positions: number[] }

/**
 * Returns the still of each picked chapter's imagined image by position: the stored image, or else one drawn, checked,
 * stored, and billed. A chapter whose image fails for any reason is left out, and the failure is reported.
 */
export async function loadImaginedChapterStillPngs({
	positions,
	...imaginedChapterImageBilling
}: LoadImaginedChapterStillPngsOptions): Promise<Map<number, Uint8Array>> {
	// no picked chapter draws nothing
	const imaginedChapterStillPngs = new Map<number, Uint8Array>()
	if (positions.length === 0) {
		return imaginedChapterStillPngs
	}

	// settle a few images at once
	try {
		const imaginedChapterImageDraws = await loadImaginedChapterImageDraws({ ...imaginedChapterImageBilling, positions })
		await runWithConcurrency(
			imaginedChapterImageDraws,
			IMAGINED_CHAPTER_IMAGE_DRAW_CONCURRENCY,
			async (imaginedChapterImageDraw) => {
				// keep the still of an image that was drawn and passed
				const stillPng = await loadImaginedChapterStillPng(imaginedChapterImageDraw)
				if (stillPng) {
					imaginedChapterStillPngs.set(imaginedChapterImageDraw.position, stillPng)
				}
			},
		)
	} catch (error) {
		// a failure before any image is settled leaves every chapter on the podcast card
		const { podcastEpisodeId } = imaginedChapterImageBilling
		reportError(error, "topic-podcast-episode-video", { podcastEpisodeId, step: "imagined-chapter-image" })
	}
	return imaginedChapterStillPngs
}

// the draw of one chapter's imagined image: the film's podcast episode, the chapter's position, the words of its scene,
// the model, the key the draw bills, or the master key if no key is given, and whether the platform pays
type ImaginedChapterImageDraw = {
	podcastEpisodeId: string
	position: number
	sceneInput: TopicImageSceneInput
	model: string
	litellmApiKey?: string
	isPlatformBilled: boolean
}

// the draw of each picked chapter's imagined image, with the words of its scene: its Finding's title and public
// relevance explanation, and nothing else. a chapter whose Finding was filtered out has the title alone
async function loadImaginedChapterImageDraws({
	podcastEpisodeId,
	ownerId,
	isPlatformBilled,
	positions,
}: ImaginedChapterImageBilling & { positions: number[] }): Promise<ImaginedChapterImageDraw[]> {
	// each picked chapter's own title, its Resource's title, and its Finding's public relevance explanation
	const chapterRows = await db
		.select({
			position: podcastEpisodeChapters.position,
			chapterTitle: podcastEpisodeChapters.title,
			resourceTitle: resources.title,
			relevanceExplanation: findings.relevanceExplanation,
		})
		.from(podcastEpisodeChapters)
		.innerJoin(resources, eq(resources.id, podcastEpisodeChapters.resourceId))
		.leftJoin(findings, eq(findings.id, podcastEpisodeChapters.findingId))
		.where(
			and(
				eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId),
				inArray(podcastEpisodeChapters.position, positions),
			),
		)

	// the owner's key, or the master key if the platform pays, and the model that draws a film's own image
	const litellmApiKey = isPlatformBilled ? undefined : await loadOrProvisionUserLiteLLMKey(ownerId)
	const model = topicImageModel()

	// the scene writer's topic name and topic prompt hold the title and the explanation
	return chapterRows.map((chapterRow) => ({
		podcastEpisodeId,
		position: chapterRow.position,
		sceneInput: {
			topicName: chapterRow.resourceTitle?.trim() || chapterRow.chapterTitle,
			topicPrompt: chapterRow.relevanceExplanation ?? "",
			tags: [],
			findingTitles: [],
		},
		model,
		litellmApiKey,
		isPlatformBilled,
	}))
}

// the still of one chapter's imagined image, or null for an image the image moderation does not pass and for any
// failure, which is reported
async function loadImaginedChapterStillPng(
	imaginedChapterImageDraw: ImaginedChapterImageDraw,
): Promise<Uint8Array | null> {
	try {
		const jpegBytes = await loadOrDrawImaginedChapterImage(imaginedChapterImageDraw)
		return jpegBytes ? await toVideoStillPng(jpegBytes) : null
	} catch (error) {
		// a spent budget, a rejection, a failed draw, and any thrown error leave the chapter on the podcast card
		const { podcastEpisodeId, position } = imaginedChapterImageDraw
		reportError(error, "topic-podcast-episode-video", {
			podcastEpisodeId,
			position: String(position),
			step: "imagined-chapter-image",
		})
		return null
	}
}

// the jpeg of one chapter's imagined image: the one a render's earlier attempt stored, or else a new one, drawn,
// billed, checked, and stored. returns null for an image the image moderation does not pass
async function loadOrDrawImaginedChapterImage({
	podcastEpisodeId,
	position,
	sceneInput,
	model,
	litellmApiKey,
	isPlatformBilled,
}: ImaginedChapterImageDraw): Promise<Uint8Array | null> {
	// a stored image is reused, so a render's second attempt draws nothing
	const imageKey = toTopicPodcastEpisodeVideoChapterImageKey(podcastEpisodeId, position)
	if (await attachmentExists(imageKey)) {
		return getAttachmentBytes(imageKey)
	}

	// draw the image, and add what the draw cost to the film unless the platform pays
	const { jpegBytes } = await drawTopicPodcastEpisodeVideoImageOriginal({ sceneInput, model, litellmApiKey })
	if (!isPlatformBilled) {
		await db
			.update(topicPodcastEpisodeVideos)
			.set({ cost: sql`${topicPodcastEpisodeVideos.cost} + ${topicImageCostDollars(model).toFixed(6)}` })
			.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))
	}

	// only an image that passes the image moderation is stored and shown
	if (!(await isImaginedChapterImageAllowed({ jpegBytes, podcastEpisodeId, position }))) {
		return null
	}
	await uploadAttachment(imageKey, jpegBytes, "image/jpeg")
	return jpegBytes
}

// a drawn image, and the film's podcast episode and the chapter's position, which name it in a failure report
type IsImaginedChapterImageAllowedOptions = { jpegBytes: Uint8Array; podcastEpisodeId: string; position: number }

// whether a drawn image may be shown: the image moderation found no violation, or it was skipped with no moderation
// key set. a violation, an image the moderation cannot read, and a failed check keep the image out
async function isImaginedChapterImageAllowed({
	jpegBytes,
	podcastEpisodeId,
	position,
}: IsImaginedChapterImageAllowedOptions): Promise<boolean> {
	const classification = await classifyImage({ dataUrl: toImageDataUri(jpegBytes, "image/jpeg") })
	if (classification.outcome === "classified") {
		return !classification.verdict.isViolation
	}

	// a failed check is reported, without the image
	if (classification.outcome === "failed") {
		reportError(classification.error, "topic-podcast-episode-video", {
			podcastEpisodeId,
			position: String(position),
			step: "imagined-chapter-image-moderation",
		})
	}
	return classification.outcome === "skipped"
}
