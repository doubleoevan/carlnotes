// A video scene plan selects approved pictures and exact words from the recorded chapter.
import { createHash } from "node:crypto"
import { z } from "zod"
import {
	CHAPTER_ANIMATION_CANDIDATE_LIMIT,
	canAnimateRegion,
	isInsidePicture,
	pictureAnimationRegion,
} from "./pictureAnimation"
import type { VideoSceneSource } from "./topicVideoImageCheck"
import type { ShownImageStill } from "./topicVideoInputs"
import type { VideoCaptionCue } from "./videoCaptions"
import { toCaptionBreakFrames, toVideoShots } from "./videoShots"
import { VIDEO_FRAMES_PER_SECOND as FPS, type VideoSegment } from "./videoTimeline"

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/)
const sceneImage = z.strictObject({
	sourceImageHash: sha256Hex,
	animationFileHash: sha256Hex.optional(),
	width: z.int().positive().max(65535),
	height: z.int().positive().max(65535),
	origin: z.enum(["resource", "generated", "house"]),
})
const beat = z.strictObject({
	start: z.int().nonnegative(),
	end: z.int().positive(),
	move: z.enum(["zoom-in", "zoom-out", "pan-left", "pan-right"]),
	sourceImageHash: sha256Hex,
})
const schema = z.strictObject({
	version: z.literal(2),
	templateVersion: z.literal(2),
	timingVersion: z.literal(1),
	rendererVersion: z.literal(4),
	episode: z.string().min(1),
	position: z.int().nonnegative(),
	inputHash: sha256Hex,
	sceneImages: z.array(sceneImage).max(64),
	pictureAnimations: z
		.array(pictureAnimationRegion.extend({ sourceImageHash: sha256Hex }))
		.max(CHAPTER_ANIMATION_CANDIDATE_LIMIT)
		.optional(),
	frameCount: z.int().positive(),
	beats: z.array(beat),
})
export type VideoScenePlan = z.infer<typeof schema>

// Read the first on-disk format so an existing film can reuse its saved picture selection.
const firstSceneImage = sceneImage.omit({ sourceImageHash: true, animationFileHash: true }).extend({
	id: sha256Hex,
	motion: sha256Hex.optional(),
})
const firstPlan = schema.omit({ sceneImages: true, pictureAnimations: true }).extend({
	version: z.literal(1),
	inventory: z.array(firstSceneImage).max(64),
	beats: z.array(beat.omit({ sourceImageHash: true }).extend({ asset: sha256Hex })),
	pictureMotions: z
		.array(pictureAnimationRegion.extend({ asset: sha256Hex }))
		.max(CHAPTER_ANIMATION_CANDIDATE_LIMIT)
		.optional(),
})
const storedScenePlan = z.union([
	schema,
	firstPlan.transform(({ inventory, pictureMotions, beats, ...plan }) =>
		schema.parse({
			...plan,
			version: 2,
			sceneImages: inventory.map(({ id, motion, ...image }) => ({
				...image,
				sourceImageHash: id,
				animationFileHash: motion,
			})),
			beats: beats.map(({ asset, ...shot }) => ({ ...shot, sourceImageHash: asset })),
			pictureAnimations: pictureMotions?.map(({ asset, ...region }) => ({ ...region, sourceImageHash: asset })),
		}),
	),
])

export type VideoSceneInput = {
	episode: string
	position: number
	startSeconds: number
	frameCount: number
	title: string
	sourceImageHashes: string[]
	sceneImages?: z.infer<typeof sceneImage>[]
	renderBuild?: string
	captions: VideoCaptionCue[]
}

/** Identifies the exact approved bytes used by a render. */
export function sha256Hash(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

/**
 * Identifies the ordered scene plans and their authorized sources in one encoded chapters part.
 */
export function toVideoScenePlansHash(
	planHashes: string[],
	sources: VideoSceneSource[],
	posterHash: string | null,
): string {
	const sourceKeys = sources.map(({ position, resourceId, resourceImageKeys }) => [
		position,
		resourceId,
		resourceImageKeys,
	])
	return sha256Hash(JSON.stringify([planHashes, sourceKeys, posterHash]))
}

/**
 * Identifies the poster pixels retained alongside the bundled host illustration in a Comment segment.
 */
export function toRetainedPosterHash(
	episode: string,
	segments: VideoSegment[],
	captionStartSeconds: number[],
	poster: ShownImageStill,
): string | null {
	if (poster.isPodcastCard) {
		return null
	}

	// the first shot uses the bundled illustration and the next shot uses the film poster
	const showsPoster = segments.some((segment) => {
		if (segment.kind !== "hot-takes") {
			return false
		}
		const { frameCount, startSeconds, position } = segment
		const captionBreakFrames = toCaptionBreakFrames({
			frameCount,
			segmentStartSeconds: startSeconds,
			captionStartSeconds,
		})
		const shots = toVideoShots({
			frameCount,
			captionBreakFrames,
			imageCount: 2,
			seed: `${episode}:hot-takes:${position}`,
		})
		return shots.length > 1
	})
	return showsPoster ? sha256Hash(poster.stillPng) : null
}

/** Plan the same cut points, camera moves and picture order as the full-frame montage. */
export function planVideoScenes(input: VideoSceneInput): VideoScenePlan {
	const { episode, position, frameCount, sourceImageHashes, startSeconds, title } = input
	if (
		!sourceImageHashes.length ||
		sourceImageHashes.length > 64 ||
		!Number.isSafeInteger(frameCount) ||
		frameCount <= 0 ||
		frameCount > 4 * 3600 * FPS ||
		!Number.isFinite(startSeconds) ||
		startSeconds < 0
	) {
		throw new Error("Invalid video scene duration or images")
	}
	const captionBreakFrames = toCaptionBreakFrames({
		captionStartSeconds: input.captions.map((cue) => cue.startSeconds),
		segmentStartSeconds: startSeconds,
		frameCount,
	})
	const shots = toVideoShots({
		frameCount,
		imageCount: sourceImageHashes.length,
		captionBreakFrames,
		seed: `${episode}:chapter:${position}`,
	})
	const inputHash = sha256Hash(
		JSON.stringify([
			episode,
			position,
			frameCount,
			startSeconds,
			sourceImageHashes,
			title,
			input.captions,
			input.sceneImages,
			input.renderBuild,
		]),
	)
	const beats = shots.map((shot) => ({
		start: shot.startFrame,
		end: shot.startFrame + shot.frameCount,
		move: shot.move,
		sourceImageHash: sourceImageHashes[shot.imageIndex],
	}))
	return schema.parse({
		version: 2,
		templateVersion: 2,
		timingVersion: 1,
		rendererVersion: 4,
		sceneImages: input.sceneImages ?? [],
		episode,
		position,
		inputHash,
		frameCount,
		beats,
	})
}

/** Rechecks every source, image and frame against the current authorized input. */
export function verifyVideoScenePlan(value: unknown, expected: VideoScenePlan): VideoScenePlan {
	const parsed = storedScenePlan.safeParse(value)
	if (!parsed.success) {
		throw new Error("Invalid video scene plan")
	}
	const { pictureAnimations, ...base } = parsed.data
	const { pictureAnimations: expectedRegions, ...expectedBase } = expected
	const seen = new Set<string>()
	const isValid = pictureAnimations?.every(({ sourceImageHash, ...region }) => {
		// Verify the saved region against the current approved picture and the shots that show it.
		const image = expected.sceneImages.find((entry) => entry.sourceImageHash === sourceImageHash)
		if (
			!image ||
			image.animationFileHash ||
			seen.has(sourceImageHash) ||
			!expected.beats.some((beat) => beat.sourceImageHash === sourceImageHash)
		) {
			return false
		}
		seen.add(sourceImageHash)
		return canAnimateRegion(region, image.origin) && isInsidePicture(region, image)
	})
	if (
		isValid === false ||
		(expectedRegions && JSON.stringify(expectedRegions) !== JSON.stringify(pictureAnimations)) ||
		JSON.stringify(base) !== JSON.stringify(expectedBase)
	) {
		throw new Error("Video scene plan does not match its scene sources, images or shot timing")
	}
	return parsed.data
}

/** Resolves an episode-owned plan against today's approved inputs before a render or retry. */
export function resolveSavedVideoScenePlan(bytes: string, expected: VideoScenePlan, isRetry: boolean): VideoScenePlan {
	// Malformed bytes get one staged recovery. Valid saved scene images must survive a retry in full.
	let previous: VideoScenePlan
	let firstFormat: boolean
	try {
		const stored = JSON.parse(bytes)
		previous = storedScenePlan.parse(stored)
		firstFormat = stored.version === 1
	} catch {
		return expected
	}
	if (
		isRetry &&
		previous.episode === expected.episode &&
		previous.position === expected.position &&
		previous.sceneImages.some(
			(image) =>
				!expected.sceneImages.some(
					(current) =>
						current.sourceImageHash === image.sourceImageHash && current.animationFileHash === image.animationFileHash,
				),
		)
	) {
		throw new Error("A saved chapter image is missing or no longer approved")
	}
	// Region choices belong to the exact pictures. Validate them against every shot when upgrading the stored format.
	if (firstFormat) {
		previous = { ...previous, inputHash: expected.inputHash }
	} else if (previous.inputHash !== expected.inputHash) {
		return expected
	}
	try {
		return verifyVideoScenePlan(previous, expected)
	} catch {
		return expected
	}
}

/** Rejects a retained chapter when its saved plan refers to pictures that have since lost approval. */
export function checkRetainedScenePictures(
	value: unknown,
	episode: string,
	position: number,
	approved: Set<string>,
): string {
	const plan = storedScenePlan.parse(value)
	const shown = new Set(plan.beats.map((beat) => beat.sourceImageHash))
	if (
		plan.episode !== episode ||
		plan.position !== position ||
		plan.sceneImages.some(
			(image) => (image.origin !== "house" || shown.has(image.sourceImageHash)) && !approved.has(image.sourceImageHash),
		)
	) {
		throw Error("The stored film chapter contains a picture that is no longer approved")
	}
	return sha256Hash(JSON.stringify(plan))
}
