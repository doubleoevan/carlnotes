// Prepare only this Finding's images and caption cues for the supervised, offline chapter renderer.

import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

import { toUprightImageSize } from "../uprightImageSize"
import { applyGeneratedPictureAnimation } from "./generatedPictureAnimation"
import { acceptLocalPictureAnimation, FILM_LOCAL_ANIMATION_LIMIT } from "./pictureAnimation"
import { planPictureAnimation } from "./planPictureAnimation"
import { loadReviewedAnimation } from "./reviewedAnimation"
import { recordPictureAnimationCost, recordPlatformTopicVideoSpend } from "./topicVideoRows"
import { type RunOutsideSlot, runWithoutSlot } from "./topicVideoSlot"
import type { VideoCaptionCue } from "./videoCaptions"
import { loadPodcastCardStillPng, toVideoStillPng } from "./videoFrames"
import { joinVideoPartShots, renderSegmentShots, type VideoChapterImages, type VideoSegmentImage } from "./videoParts"
import { checkVideoSceneOutput } from "./videoSceneOutput"
import { planVideoScenes, sha256Hash, toStoredVideoScenePlan } from "./videoScenePlan"
import { saveVideoScenePlan } from "./videoSceneStorage"
import { VIDEO_FRAMES_PER_SECOND, type VideoSegment } from "./videoTimeline"

// one chapter's render: its podcast episode, the render's temp folder, the chapter's images, timeline segment, and
// captions, whether the attempt is a retry, what animations it may use and who pays, and how its plan is saved
type RenderVideoSceneOptions = {
	podcastEpisodeId: string
	workDirectory: string
	chapter: VideoChapterImages
	segment: Extract<VideoSegment, { kind: "chapter" }>
	captions: VideoCaptionCue[]
	isRetry: boolean
	// the pictures already animated in this film, and the animation's billing
	localAnimationAssets?: Set<string>
	animationBilling?: { ownerId: string; isPlatformBilled: boolean; isStoredAnimationOnly?: boolean }
	resolvePlan?: typeof saveVideoScenePlan
	onEncodedPlan?: (planHash: string) => void
	// runs the planner's call and a paid clip's generation outside the render's slot
	runOutsideSlot?: RunOutsideSlot
	signal?: AbortSignal
}

/** Writes the chapter's silent H.264 part. Its approved pictures and silent animation files belong to this attempt. */
export async function renderVideoScene({
	podcastEpisodeId,
	workDirectory,
	chapter,
	segment,
	captions,
	isRetry,
	resolvePlan = saveVideoScenePlan,
	onEncodedPlan,
	localAnimationAssets = new Set<string>(),
	animationBilling,
	runOutsideSlot = runWithoutSlot,
	signal,
}: RenderVideoSceneOptions): Promise<string> {
	const directory = await mkdtemp(join(workDirectory, "scene-"))
	try {
		const prepared = await prepareVideoSceneImages(chapter.images, directory, signal)
		const { videoSceneImages, images } = prepared
		const { position, startSeconds, frameCount } = segment
		const endFrame = Math.round(startSeconds * VIDEO_FRAMES_PER_SECOND) + frameCount
		const chapterCaptions = captions.filter(
			(cue) => cue.startSeconds >= startSeconds && Math.round(cue.startSeconds * VIDEO_FRAMES_PER_SECOND) < endFrame,
		)
		const bundle = fileURLToPath(new URL("./videoEncode.ts", import.meta.url))
		const renderBuild = await videoSceneBuild(bundle)
		const input = {
			videoSceneImages,
			renderBuild,
			episode: podcastEpisodeId,
			position,
			startSeconds,
			frameCount,
			title: chapter.hasPublicSceneSource ? chapter.lowerThirdText.title : "",
			sourceImageHashes: videoSceneImages.map((asset) => asset.sourceImageHash),
			captions: chapter.hasPublicSceneSource ? chapterCaptions : [],
		}
		const expected = planVideoScenes(input)
		const plan = await resolvePlan(
			expected,
			isRetry,
			animationBilling &&
				!animationBilling.isStoredAnimationOnly &&
				chapter.hasPublicSceneSource &&
				localAnimationAssets.size < FILM_LOCAL_ANIMATION_LIMIT
				? async () => {
						// Consider only shown pictures that have no approved loop. Keep each exact image once per call.
						const candidates = videoSceneImages.flatMap((asset, index) => {
							const origin = asset.origin
							const image = images[index]
							const { sourceImageHash } = asset

							// leave out a picture that is not shown, already has a loop, or was listed earlier
							const isShown = expected.beats.some((beat) => beat.sourceImageHash === sourceImageHash)
							const firstIndex = videoSceneImages.findIndex((entry) => entry.sourceImageHash === sourceImageHash)
							if (!image || origin === "house" || asset.animationFileHash || !isShown || firstIndex !== index) {
								return []
							}

							// the picture as a candidate, with the loader of its thumbnail
							return [{ ...asset, origin, thumbnail: image.loadStillPng }]
						})

						// ask the planner outside the render's slot, and keep the montage if it fails
						try {
							const recordCost = animationBilling.isPlatformBilled
								? (dollars: number) =>
										recordPlatformTopicVideoSpend({ podcastEpisodeId, kind: "topicVideoAnimationPlan", dollars })
								: (dollars: number) => recordPictureAnimationCost(podcastEpisodeId, dollars)
							return await runOutsideSlot(() =>
								planPictureAnimation(candidates, { ...animationBilling, recordCost }, signal),
							)
						} catch (error) {
							signal?.throwIfAborted()
							console.warn("Film picture animation planning failed", {
								podcastEpisodeId,
								position,
								reason: error instanceof Error ? error.name : "unknown",
							})
							return []
						}
					}
				: undefined,
			signal,
		)
		// A paid animation uses the owner's monthly allowance. Approved host loops have their own artwork.
		const animatedSourceImageHash =
			chapter.hasPublicSceneSource && animationBilling && !animationBilling.isPlatformBilled
				? await runOutsideSlot(() =>
						applyGeneratedPictureAnimation({
							plan,
							images,
							directory,
							ownerId: animationBilling.ownerId,
							isRetry: isRetry || !!animationBilling.isStoredAnimationOnly,
							signal,
						}),
					)
				: undefined

		// Allocate local effects in chapter order. Repeated shots of one picture use the same slot.
		for (const [index, image] of images.entries()) {
			const region = plan.pictureAnimations?.find(
				(choice) => choice.sourceImageHash === videoSceneImages[index]?.sourceImageHash,
			)
			// the paid clip's picture takes no local effect, and a film takes eight local effects at most
			if (
				region &&
				region.sourceImageHash !== animatedSourceImageHash &&
				acceptLocalPictureAnimation(localAnimationAssets, region.sourceImageHash)
			) {
				image.pictureAnimation = region
			}
		}
		// The normal montage encoder places each moving picture under its pan, zoom, lower third and fades.
		const plannedShots = plan.beats.map((beat, index) => ({
			startFrame: beat.start,
			frameCount: beat.end - beat.start,
			move: beat.move,
			imageIndex: index % plan.videoSceneImages.length,
		}))
		const shotPaths = await renderSegmentShots({
			podcastEpisodeId,
			workDirectory: directory,
			segment,
			images,
			plannedShots,
			lowerThirdText: chapter.lowerThirdText,
			captionStartSeconds: captions.map((cue) => cue.startSeconds),
			signal,
		})
		const output = join(workDirectory, `scene-${position}.mp4`)
		await joinVideoPartShots({ shotPaths, listPath: join(directory, "shots.txt"), partPath: output, signal })
		await checkVideoSceneOutput(output, frameCount, signal)
		// bind the completed frames to the exact plan held by this encoder
		onEncodedPlan?.(sha256Hash(JSON.stringify(toStoredVideoScenePlan(plan))))
		return output
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}

// Bind each animation loop to its reviewed source and store its file hash in the private plan.
async function prepareVideoSceneImages(input: VideoSegmentImage[], directory: string, signal?: AbortSignal) {
	const videoSceneImages: NonNullable<import("./videoScenePlan").VideoSceneInput["videoSceneImages"]> = []
	const images: VideoSegmentImage[] = []
	for (const image of input) {
		signal?.throwIfAborted()
		const original = image.loadSceneImage ? await image.loadSceneImage() : await image.loadStillPng()
		const sourceImageHash = sha256Hash(original)
		const info = toUprightImageSize(await sharp(original, { limitInputPixels: 40_000_000 }).metadata())

		// the reviewed loop of this exact picture, if one exists, written beside the chapter's files
		const clip = await loadReviewedAnimation(original, image.loadStillPng === loadPodcastCardStillPng)
		const animationFileHash = clip ? sha256Hash(clip) : undefined
		const reviewedAnimationPath = animationFileHash ? join(directory, `${animationFileHash}.webm`) : undefined
		if (reviewedAnimationPath && clip) {
			await Bun.write(reviewedAnimationPath, clip)
		}
		videoSceneImages.push({
			sourceImageHash,
			width: info.width,
			height: info.height,
			origin: image.origin ?? "house",
			...(animationFileHash ? { animationFileHash } : {}),
		})
		images.push({
			...image,
			loadStillPng: async (width) => (image.loadSceneImage ? toVideoStillPng(original, width) : original),
			reviewedAnimationPath,
		})
	}
	return { images, videoSceneImages }
}

// Hash the montage, animation lookup and encoder together so a retry uses the appropriate plan.
async function videoSceneBuild(bundle: string): Promise<string> {
	const paths = [
		bundle,
		...[
			"./videoParts.ts",
			"./videoShots.ts",
			"./videoH264.ts",
			"./reviewedAnimation.ts",
			"./pictureAnimation.ts",
			"./generatedPictureAnimation.ts",
			"./planPictureAnimation.ts",
			"./pictureAnimationChoices.ts",
			"../../models/prompts/plan-picture-animation.md",
			"../package.json",
		].map((path) => fileURLToPath(new URL(path, import.meta.url))),
	]
	const rendererFileHashes = await Promise.all(paths.map(async (path) => sha256Hash(await Bun.file(path).bytes())))
	return toVideoSceneBuildHash(sha256Hash(rendererFileHashes.join("/")))
}

/** Two builds render identical frames across the scene-image rename. Both reuse the same saved selections. */
export function toVideoSceneBuildHash(fileHash: string): string {
	return fileHash === "aff8b4e73f4e1b688a572c3e6c131978644c6f442f8178863cb46b7cf36ad7aa"
		? "e14d44279057bdf0fafc7725276fae9d37277a2d0dfad6dee9c5efc04254b4ae"
		: fileHash
}
