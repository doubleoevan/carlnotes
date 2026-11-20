// a chapter's generated images in a podcast episode film: each is generated in the film house style from the Finding's
// title and public relevance explanation, in the framing of its number, billed like the film's own image, kept under a
// key that is never served until the image moderation has checked it, and then stored beside the film's parts, where a
// second attempt reuses it. a rejected image leaves a marker, so it is never generated again. any failure leaves the
// image out

import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, topicVideos } from "@carlnotes/db/schema/podcast"
import { findings, resources } from "@carlnotes/db/schema/scans"
import {
	attachmentExists,
	deleteStoredObjects,
	getAttachmentBytes,
	recordPendingObjectDeletions,
	uploadAttachment,
} from "@carlnotes/db/store"
import {
	GENERATED_CHAPTER_IMAGE_STYLE_VERSION,
	toTopicVideoChapterImageCheckKeys,
	toTopicVideoChapterImageKeys,
	toTopicVideoChapterImageKeysThroughStyle,
} from "@carlnotes/db/topicVideoKeys"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { classifyImage } from "@carlnotes/models/moderation"
import { topicImageCostDollars, topicImageModel } from "@carlnotes/models/topicImageModel"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { toDataUrl } from "@carlnotes/server/dataUrl"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { TopicImageSceneInput } from "../topicImages/writeTopicImageScene"
import {
	GENERATED_CHAPTER_IMAGE_FORMAT,
	generateTopicVideoImageOriginal,
	TOPIC_VIDEO_IMAGE_FRAMING,
} from "./topicVideoImage"
import { recordPlatformTopicVideoSpend } from "./topicVideoRows"

// how many chapter images are generated at once
const CHAPTER_IMAGE_GENERATION_CONCURRENCY = 4

// the framing each of a chapter's generated images takes, by the image's number, so the images of one chapter differ.
// the first is the film image's own framing
const GENERATED_CHAPTER_IMAGE_FRAMINGS = [
	TOPIC_VIDEO_IMAGE_FRAMING,
	"a close view of one telling detail, with the subject large in the frame over a soft, plain background",
	"a view from above, looking down on the scene laid out below",
	"people at work in the middle distance, seen from behind or in profile, with no face in close view",
	"a still life of a few objects on a surface, lit from one side",
	"a low view that looks up at the subject against the sky or a ceiling",
]

// the film's podcast episode, its owner, whether the platform pays for the generated images, as the backfill does, and
// the signal that stops the image generations
export type GeneratedChapterImageBilling = {
	podcastEpisodeId: string
	ownerId: string
	isPlatformBilled: boolean
	signal?: AbortSignal
}

// one generated image to settle: its chapter's position, and its number among the chapter's generated images, from zero
export type GeneratedChapterImageRef = { position: number; imageNumber: number }

// the film's billing, the generated images to settle, and whether image generation is skipped, so only stored ones
// are read
type LoadGeneratedChapterImagesOptions = GeneratedChapterImageBilling & {
	generatedChapterImageRefs: GeneratedChapterImageRef[]
	isChapterImageGenerationSkipped?: boolean
}

// each chapter's generated images as jpegs by its position, in the order they were numbered, and how many of them
// this call generated
type GeneratedChapterImages = {
	jpegBytesByPosition: Map<number, Uint8Array[]>
	newlyGeneratedChapterImageCount: number
}

/**
 * Returns each chapter's generated images by position: the stored ones, or else ones generated, checked, stored, and
 * billed, unless image generation is skipped. An image that fails for any reason is left out, and the failure is
 * reported. Throws the signal's reason once it is aborted.
 */
export async function loadGeneratedChapterImages({
	generatedChapterImageRefs,
	...generatedChapterImageBilling
}: LoadGeneratedChapterImagesOptions): Promise<GeneratedChapterImages> {
	// no image to settle generates nothing
	const generatedChapterImages: GeneratedChapterImages = {
		jpegBytesByPosition: new Map(),
		newlyGeneratedChapterImageCount: 0,
	}
	if (generatedChapterImageRefs.length === 0) {
		return generatedChapterImages
	}

	// settle a few images at once, in the order they are numbered
	const settledImages: (SettledGeneratedChapterImage | null)[] = []
	try {
		const chapterImageGenerations = await loadChapterImageGenerations({
			...generatedChapterImageBilling,
			generatedChapterImageRefs,
		})
		settledImages.push(
			...(await runWithConcurrency(
				chapterImageGenerations,
				CHAPTER_IMAGE_GENERATION_CONCURRENCY,
				settleGeneratedChapterImage,
			)),
		)
	} catch (error) {
		// a stopped render throws. any other failure before an image is settled leaves every chapter on the images it has
		const { podcastEpisodeId, signal } = generatedChapterImageBilling
		signal?.throwIfAborted()
		reportError(error, "topic-video", { podcastEpisodeId, step: "generated-chapter-image" })
	}

	// group the images that settled by their chapter, and count the ones generated now
	for (const settledImage of settledImages) {
		if (!settledImage) {
			continue
		}

		// add the image after the ones its chapter already has
		const chapterJpegs = generatedChapterImages.jpegBytesByPosition.get(settledImage.position) ?? []
		generatedChapterImages.jpegBytesByPosition.set(settledImage.position, [...chapterJpegs, settledImage.jpegBytes])
		generatedChapterImages.newlyGeneratedChapterImageCount += settledImage.isNewlyGenerated ? 1 : 0
	}
	return generatedChapterImages
}

// the film's podcast episode and its chapters' positions
type DeleteOlderStyleGeneratedChapterImagesOptions = { podcastEpisodeId: string; positions: number[] }

/**
 * Deletes every generated image that a film's chapters may have in an older style. The keys are recorded as pending
 * deletions first, so a failed object delete is tried again.
 */
export async function deleteOlderStyleGeneratedChapterImages({
	podcastEpisodeId,
	positions,
}: DeleteOlderStyleGeneratedChapterImagesOptions): Promise<void> {
	// record each chapter's keys in each style before the current one, then delete the objects
	const objectKeys = toTopicVideoChapterImageKeysThroughStyle(
		podcastEpisodeId,
		positions,
		GENERATED_CHAPTER_IMAGE_STYLE_VERSION - 1,
	)
	await recordPendingObjectDeletions({ handle: db, objectKeys })
	await deleteStoredObjects(objectKeys)
}

// one chapter image's generation: the film's billing, the chapter's position, the image's number, whether image
// generation is skipped, the words of its scene, its framing, the model, and the key it bills, or the master key if no
// key is given
type ChapterImageGeneration = GeneratedChapterImageRef & {
	podcastEpisodeId: string
	signal?: AbortSignal
	isChapterImageGenerationSkipped: boolean
	// what the image generation reads and bills
	sceneInput: TopicImageSceneInput
	framing: string
	model: string
	loadLitellmApiKey: () => Promise<string | undefined>
	isPlatformBilled: boolean
}

// each chapter image's generation, with the words of its scene: its Finding's title and public relevance explanation,
// and nothing else. a chapter whose Finding was filtered out has the title alone
async function loadChapterImageGenerations({
	podcastEpisodeId,
	ownerId,
	isPlatformBilled,
	signal,
	generatedChapterImageRefs,
	isChapterImageGenerationSkipped = false,
}: LoadGeneratedChapterImagesOptions): Promise<ChapterImageGeneration[]> {
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

	// the owner's key, loaded once by the first image that is generated, or the master key if the platform pays, and the
	// model that generates the image
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
		const framing = GENERATED_CHAPTER_IMAGE_FRAMINGS[framingIndex] ?? TOPIC_VIDEO_IMAGE_FRAMING
		const billing = { podcastEpisodeId, isPlatformBilled, signal }
		return [
			{
				...generatedChapterImageRef,
				...billing,
				isChapterImageGenerationSkipped,
				sceneInput,
				framing,
				model,
				loadLitellmApiKey,
			},
		]
	})
}

// one settled generated image: its chapter's position, its jpeg, and whether this call generated it
type SettledGeneratedChapterImage = { position: number; jpegBytes: Uint8Array; isNewlyGenerated: boolean }

// settle one generated image, or return null for an image the image moderation does not pass and for any failure, which
// is reported
async function settleGeneratedChapterImage(
	chapterImageGeneration: ChapterImageGeneration,
): Promise<SettledGeneratedChapterImage | null> {
	try {
		chapterImageGeneration.signal?.throwIfAborted()
		return await loadOrGenerateChapterImage(chapterImageGeneration)
	} catch (error) {
		// a stopped render throws. a spent budget, a rejection, a failed image generation, and any other error leave the
		// chapter on the images it has
		const { podcastEpisodeId, position, imageNumber, signal } = chapterImageGeneration
		signal?.throwIfAborted()
		reportError(error, "topic-video", {
			podcastEpisodeId,
			position: String(position),
			imageNumber: String(imageNumber),
			step: "generated-chapter-image",
		})
		return null
	}
}

// one generated image's jpeg: the one an earlier render stored, or else a new one, generated, billed, kept unchecked,
// checked, and stored. an image that an earlier attempt generated and could not check is checked now, with no second
// image generation. returns null for an image that the image moderation rejected now or before, for one whose check
// did not run, and for an image not stored if image generation is skipped
async function loadOrGenerateChapterImage(
	chapterImageGeneration: ChapterImageGeneration,
): Promise<SettledGeneratedChapterImage | null> {
	// a stored image passed its check, so a render's second attempt and a re-render generate nothing
	const { podcastEpisodeId, position, imageNumber, isChapterImageGenerationSkipped } = chapterImageGeneration
	const imageKey = toTopicVideoChapterImageKeys(podcastEpisodeId, position)[imageNumber]
	if (!imageKey) {
		return null
	}
	if (await attachmentExists(imageKey)) {
		return { position, jpegBytes: await getAttachmentBytes(imageKey), isNewlyGenerated: false }
	}

	// generate nothing if image generation is skipped, and never generate a rejected image again
	const { uncheckedKey, rejectedKey } = toTopicVideoChapterImageCheckKeys(imageKey)
	if (isChapterImageGenerationSkipped || (await attachmentExists(rejectedKey))) {
		return null
	}

	// the image an earlier attempt kept unchecked, or a new one, kept unchecked before its check can fail
	const hasUncheckedImage = await attachmentExists(uncheckedKey)
	const jpegBytes = hasUncheckedImage
		? await getAttachmentBytes(uncheckedKey)
		: await generateUncheckedChapterImage(chapterImageGeneration, uncheckedKey)

	// a check that did not run keeps the image unchecked for the next attempt
	const imageCheck = await checkGeneratedChapterImage({ jpegBytes, podcastEpisodeId, position })
	if (imageCheck === "unchecked") {
		return null
	}

	// a rejection leaves its marker before the image goes, and a pass puts the image under the key that is served
	const isAllowed = imageCheck === "allowed"
	await (isAllowed
		? uploadAttachment(imageKey, jpegBytes, "image/jpeg")
		: uploadAttachment(rejectedKey, new Uint8Array(), "text/plain"))
	await deleteStoredObjects([uncheckedKey])
	return isAllowed ? { position, jpegBytes, isNewlyGenerated: !hasUncheckedImage } : null
}

// generate one image, bill it, and keep its jpeg under the unchecked key, which is never served. returns the jpeg
async function generateUncheckedChapterImage(
	{ podcastEpisodeId, sceneInput, framing, model, loadLitellmApiKey, isPlatformBilled }: ChapterImageGeneration,
	uncheckedKey: string,
): Promise<Uint8Array> {
	// generate the image
	const format = GENERATED_CHAPTER_IMAGE_FORMAT
	const imageGeneration = { sceneInput, framing, format, model, litellmApiKey: await loadLitellmApiKey() }
	const { jpegBytes } = await generateTopicVideoImageOriginal(imageGeneration)

	// add the image generation's cost to the film row, or record it as the platform's if the platform pays
	const dollars = topicImageCostDollars(model)
	if (isPlatformBilled) {
		await recordPlatformTopicVideoSpend({ podcastEpisodeId, kind: "topicVideoChapterImage", dollars })
	} else {
		// the owner's image adds to what the film cost them
		await db
			.update(topicVideos)
			.set({ cost: sql`${topicVideos.cost} + ${dollars.toFixed(6)}` })
			.where(eq(topicVideos.podcastEpisodeId, podcastEpisodeId))
	}

	// keep the paid image before its check, so a check that fails to run costs no second image generation
	await uploadAttachment(uncheckedKey, jpegBytes, "image/jpeg")
	return jpegBytes
}

// a generated image, and the film's podcast episode and the chapter's position, which name it in a failure report
type IsGeneratedChapterImageAllowedOptions = { jpegBytes: Uint8Array; podcastEpisodeId: string; position: number }

// how a generated image's check ended: it may be shown, the image moderation rejected it, or the check did not run
type GeneratedChapterImageCheck = "allowed" | "rejected" | "unchecked"

// check a generated image: allowed if the image moderation found no violation, or was skipped with no moderation key
// set, rejected for a violation and for an image the moderation cannot read, and unchecked for a failed check, which
// is reported without the image
async function checkGeneratedChapterImage({
	jpegBytes,
	podcastEpisodeId,
	position,
}: IsGeneratedChapterImageAllowedOptions): Promise<GeneratedChapterImageCheck> {
	const classification = await classifyImage({ dataUrl: toDataUrl("image/jpeg", jpegBytes) })
	if (classification.outcome === "classified") {
		return classification.verdict.isViolation ? "rejected" : "allowed"
	}
	if (classification.outcome !== "failed") {
		return classification.outcome === "skipped" ? "allowed" : "rejected"
	}

	// a failed check is reported, without the image
	reportError(classification.error, "topic-video", {
		podcastEpisodeId,
		position: String(position),
		step: "generated-chapter-image-moderation",
	})
	return "unchecked"
}

/**
 * Returns whether a generated image may be shown. A violation, an image the moderation cannot read, and a failed check
 * leave the image out.
 */
export async function isGeneratedChapterImageAllowed(
	isGeneratedChapterImageAllowedOptions: IsGeneratedChapterImageAllowedOptions,
): Promise<boolean> {
	return (await checkGeneratedChapterImage(isGeneratedChapterImageAllowedOptions)) === "allowed"
}
