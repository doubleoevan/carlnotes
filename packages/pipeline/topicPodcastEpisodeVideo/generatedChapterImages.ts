// a chapter's generated images in a podcast episode film: each is drawn in the film house style from the Finding's
// title and public relevance explanation, in the framing of its number, checked by the image moderation, stored beside
// the film's parts, where a second attempt reuses it, and billed like the film's own image. any failure leaves the
// image out

import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { findings, resources } from "@carlnotes/db/schema/scans"
import { attachmentExists, getAttachmentBytes, uploadAttachment } from "@carlnotes/db/store"
import { toTopicPodcastEpisodeVideoChapterImageKeys } from "@carlnotes/db/topicPodcastEpisodeVideoKeys"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { classifyImage } from "@carlnotes/models/moderation"
import { topicImageCostDollars, topicImageModel } from "@carlnotes/models/topicImageModel"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, inArray, sql } from "drizzle-orm"
import { toImageDataUri } from "../cardElementPng"
import type { TopicImageSceneInput } from "../topicImages/writeTopicImageScene"
import {
	drawTopicPodcastEpisodeVideoImageOriginal,
	GENERATED_CHAPTER_IMAGE_FORMAT,
	TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FRAMING,
} from "./topicPodcastEpisodeVideoImage"

// how many generated images are drawn at once
const GENERATED_CHAPTER_IMAGE_DRAW_CONCURRENCY = 4

// the framing each of a chapter's generated images takes, by the image's number, so the images of one chapter differ.
// the first is the film image's own framing
const GENERATED_CHAPTER_IMAGE_FRAMINGS = [
	TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FRAMING,
	"a close view of one telling detail, with the subject large in the frame over a soft, plain background",
	"a view from above, looking down on the scene laid out below",
	"people at work in the middle distance, seen from behind or in profile, with no face in close view",
	"a still life of a few objects on a surface, lit from one side",
	"a low view that looks up at the subject against the sky or a ceiling",
]

// the film's podcast episode, its owner, whether the platform pays for the generated images, as the backfill does, and
// the signal that stops the draws
export type GeneratedChapterImageBilling = {
	podcastEpisodeId: string
	ownerId: string
	isPlatformBilled: boolean
	signal?: AbortSignal
}

// one generated image to settle: its chapter's position, and its number among the chapter's generated images, from zero
export type GeneratedChapterImageRef = { position: number; imageNumber: number }

// the film's billing, and the generated images to settle
type LoadGeneratedChapterImagesOptions = GeneratedChapterImageBilling & {
	generatedChapterImageRefs: GeneratedChapterImageRef[]
}

// each chapter's generated images as jpegs by its position, in the order they were numbered, and how many of them this
// call drew
type GeneratedChapterImages = {
	jpegBytesByPosition: Map<number, Uint8Array[]>
	drawnGeneratedChapterImageCount: number
}

/**
 * Returns each chapter's generated images by position: the stored ones, or else ones drawn, checked, stored, and
 * billed. An image that fails for any reason is left out, and the failure is reported. Throws the signal's reason once
 * it is aborted.
 */
export async function loadGeneratedChapterImages({
	generatedChapterImageRefs,
	...generatedChapterImageBilling
}: LoadGeneratedChapterImagesOptions): Promise<GeneratedChapterImages> {
	// no image to settle draws nothing
	const generatedChapterImages: GeneratedChapterImages = {
		jpegBytesByPosition: new Map(),
		drawnGeneratedChapterImageCount: 0,
	}
	if (generatedChapterImageRefs.length === 0) {
		return generatedChapterImages
	}

	// settle a few images at once, in the order they are numbered
	const settledImages: (SettledGeneratedChapterImage | null)[] = []
	try {
		const generatedChapterImageDraws = await loadGeneratedChapterImageDraws({
			...generatedChapterImageBilling,
			generatedChapterImageRefs,
		})
		settledImages.push(
			...(await runWithConcurrency(
				generatedChapterImageDraws,
				GENERATED_CHAPTER_IMAGE_DRAW_CONCURRENCY,
				settleGeneratedChapterImage,
			)),
		)
	} catch (error) {
		// a stopped render throws. any other failure before an image is settled leaves every chapter on the images it has
		const { podcastEpisodeId, signal } = generatedChapterImageBilling
		signal?.throwIfAborted()
		reportError(error, "topic-podcast-episode-video", { podcastEpisodeId, step: "generated-chapter-image" })
	}

	// group the images that settled by their chapter, and count the ones drawn now
	for (const settledImage of settledImages) {
		if (!settledImage) {
			continue
		}

		// add the image after the ones its chapter already has
		const chapterJpegs = generatedChapterImages.jpegBytesByPosition.get(settledImage.position) ?? []
		generatedChapterImages.jpegBytesByPosition.set(settledImage.position, [...chapterJpegs, settledImage.jpegBytes])
		generatedChapterImages.drawnGeneratedChapterImageCount += settledImage.isDrawn ? 1 : 0
	}
	return generatedChapterImages
}

// the draw of one generated image: the film's billing, the chapter's position, the image's number, the words of its
// scene, its framing, the model, and the key the draw bills, or the master key if no key is given
type GeneratedChapterImageDraw = GeneratedChapterImageRef & {
	podcastEpisodeId: string
	signal?: AbortSignal
	// what the draw reads and bills
	sceneInput: TopicImageSceneInput
	framing: string
	model: string
	loadLitellmApiKey: () => Promise<string | undefined>
	isPlatformBilled: boolean
}

// the draw of each generated image, with the words of its scene: its Finding's title and public relevance explanation,
// and nothing else. a chapter whose Finding was filtered out has the title alone
async function loadGeneratedChapterImageDraws({
	podcastEpisodeId,
	ownerId,
	isPlatformBilled,
	signal,
	generatedChapterImageRefs,
}: LoadGeneratedChapterImagesOptions): Promise<GeneratedChapterImageDraw[]> {
	// each chapter's own title, its Resource's title, and its Finding's public relevance explanation
	const positions = [...new Set(generatedChapterImageRefs.map(({ position }) => position))]
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

	// the owner's key, loaded once by the first image that is drawn, or the master key if the platform pays, and the
	// model that draws a generated image
	let litellmApiKeyLoad: Promise<string | undefined> | undefined
	const loadLitellmApiKey = (): Promise<string | undefined> => {
		litellmApiKeyLoad ??= isPlatformBilled ? Promise.resolve(undefined) : loadOrProvisionUserLiteLLMKey(ownerId)
		return litellmApiKeyLoad
	}
	const model = topicImageModel()

	// the scene writer's topic name and topic prompt hold the title and the explanation, and each image of a chapter
	// takes the framing of its number
	return generatedChapterImageRefs.flatMap((generatedChapterImageRef) => {
		const chapterRow = chapterRows.find(({ position }) => position === generatedChapterImageRef.position)
		if (!chapterRow) {
			return []
		}
		const sceneInput = {
			topicName: chapterRow.resourceTitle?.trim() || chapterRow.chapterTitle,
			topicPrompt: chapterRow.relevanceExplanation ?? "",
			tags: [],
			findingTitles: [],
		}
		const framingIndex = generatedChapterImageRef.imageNumber % GENERATED_CHAPTER_IMAGE_FRAMINGS.length
		const framing = GENERATED_CHAPTER_IMAGE_FRAMINGS[framingIndex] ?? TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FRAMING
		const billing = { podcastEpisodeId, isPlatformBilled, signal }
		return [{ ...generatedChapterImageRef, ...billing, sceneInput, framing, model, loadLitellmApiKey }]
	})
}

// one settled generated image: its chapter's position, its jpeg, and whether this call drew it
type SettledGeneratedChapterImage = { position: number; jpegBytes: Uint8Array; isDrawn: boolean }

// settle one generated image, or return null for an image the image moderation does not pass and for any failure, which
// is reported
async function settleGeneratedChapterImage(
	generatedChapterImageDraw: GeneratedChapterImageDraw,
): Promise<SettledGeneratedChapterImage | null> {
	try {
		generatedChapterImageDraw.signal?.throwIfAborted()
		return await loadOrDrawGeneratedChapterImage(generatedChapterImageDraw)
	} catch (error) {
		// a stopped render throws. a spent budget, a rejection, a failed draw, and any other error leave the chapter on
		// the images it has
		const { podcastEpisodeId, position, imageNumber, signal } = generatedChapterImageDraw
		signal?.throwIfAborted()
		reportError(error, "topic-podcast-episode-video", {
			podcastEpisodeId,
			position: String(position),
			imageNumber: String(imageNumber),
			step: "generated-chapter-image",
		})
		return null
	}
}

// one generated image's jpeg: the one an earlier render stored, or else a new one, drawn, billed, checked, and stored.
// returns null for an image the image moderation does not pass
async function loadOrDrawGeneratedChapterImage({
	podcastEpisodeId,
	position,
	imageNumber,
	sceneInput,
	framing,
	model,
	loadLitellmApiKey,
	isPlatformBilled,
}: GeneratedChapterImageDraw): Promise<SettledGeneratedChapterImage | null> {
	// a stored image is reused, so a render's second attempt and a re-render draw nothing
	const imageKey = toTopicPodcastEpisodeVideoChapterImageKeys(podcastEpisodeId, position)[imageNumber]
	if (!imageKey) {
		return null
	}
	if (await attachmentExists(imageKey)) {
		return { position, jpegBytes: await getAttachmentBytes(imageKey), isDrawn: false }
	}

	// draw the image
	const format = GENERATED_CHAPTER_IMAGE_FORMAT
	const imageDraw = { sceneInput, framing, format, model, litellmApiKey: await loadLitellmApiKey() }
	const { jpegBytes } = await drawTopicPodcastEpisodeVideoImageOriginal(imageDraw)

	// add the draw's cost to the film row unless the platform pays
	if (!isPlatformBilled) {
		await db
			.update(topicPodcastEpisodeVideos)
			.set({ cost: sql`${topicPodcastEpisodeVideos.cost} + ${topicImageCostDollars(model).toFixed(6)}` })
			.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))
	}

	// only an image that passes the image moderation is stored and shown
	if (!(await isGeneratedChapterImageAllowed({ jpegBytes, podcastEpisodeId, position }))) {
		return null
	}
	await uploadAttachment(imageKey, jpegBytes, "image/jpeg")
	return { position, jpegBytes, isDrawn: true }
}

// a drawn image, and the film's podcast episode and the chapter's position, which name it in a failure report
type IsGeneratedChapterImageAllowedOptions = { jpegBytes: Uint8Array; podcastEpisodeId: string; position: number }

// whether a drawn image may be shown: the image moderation found no violation, or it was skipped with no moderation
// key set. a violation, an image the moderation cannot read, and a failed check leave the image out
async function isGeneratedChapterImageAllowed({
	jpegBytes,
	podcastEpisodeId,
	position,
}: IsGeneratedChapterImageAllowedOptions): Promise<boolean> {
	const classification = await classifyImage({ dataUrl: toImageDataUri(jpegBytes, "image/jpeg") })
	if (classification.outcome === "classified") {
		return !classification.verdict.isViolation
	}

	// a failed check is reported, without the image
	if (classification.outcome === "failed") {
		reportError(classification.error, "topic-podcast-episode-video", {
			podcastEpisodeId,
			position: String(position),
			step: "generated-chapter-image-moderation",
		})
	}
	return classification.outcome === "skipped"
}
