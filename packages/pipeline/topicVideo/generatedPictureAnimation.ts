// Use the chapter planner's first eligible generated picture for a film's monthly animation.
import { join } from "node:path"
import { releaseTopicVideoAnimation, reserveTopicVideoAnimation } from "@carlnotes/db/topicVideoAnimationQuota"
import { buildChapterPictureVideoPrompt, generateChapterPictureVideo } from "@carlnotes/models/chapterPictureVideo"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { reportError } from "@carlnotes/server/monitoring"
import sharp from "sharp"
import { loadOrGenerateAnimation } from "./generatedAnimationStorage"
import { isGeneratedChapterImageAllowed } from "./generatedChapterImages"
import { recordPictureAnimationCost } from "./topicVideoRows"
import type { VideoSegmentImage } from "./videoParts"
import { checkVideoSceneOutput } from "./videoSceneOutput"
import type { VideoScenePlan } from "./videoScenePlan"

/** Picks a selected illustration that appears on screen and has no authored loop. */
export function selectGeneratedAnimation(plan: VideoScenePlan) {
	return plan.pictureAnimations?.find(
		(region) =>
			plan.sceneImages.some(
				(image) =>
					image.sourceImageHash === region.sourceImageHash && image.origin === "generated" && !image.animationFileHash,
			) && plan.beats.some((beat) => beat.sourceImageHash === region.sourceImageHash),
	)
}

/** Applies a paid animation to matching shots while preserving the rest of the chapter plan. */
export async function applyGeneratedPictureAnimation(options: {
	plan: VideoScenePlan
	images: VideoSegmentImage[]
	directory: string
	ownerId: string
	isRetry: boolean
	signal?: AbortSignal
}): Promise<string | undefined> {
	const { plan, images, directory, ownerId, isRetry, signal } = options
	const region = selectGeneratedAnimation(plan)
	if (!region) {
		return
	}

	// Generate from the approved public picture alone. Use the saved bytes for every matching shot.
	const index = plan.sceneImages.findIndex((image) => image.sourceImageHash === region.sourceImageHash)
	const image = images[index]
	if (!image) {
		return
	}
	try {
		const bytes = await loadOrGenerateAnimation(
			plan.episode,
			region.sourceImageHash,
			isRetry,
			async () => {
				// Reuse a paid shot across this owner's films. One slot funds the exact image for the UTC month.
				const allowance = await reserveTopicVideoAnimation(ownerId, plan.episode, region.sourceImageHash)
				if (allowance.kind === "full") {
					return null
				}
				if (allowance.kind === "reuse") {
					return loadOrGenerateAnimation(allowance.episodeId, region.sourceImageHash, true, async () => null, signal)
				}

				let wasSubmitted = false
				try {
					const apiKey = allowance.platformPays
						? Bun.env.LITELLM_MASTER_KEY
						: await loadOrProvisionUserLiteLLMKey(ownerId)
					if (!apiKey) {
						throw Error("The platform film model key is missing")
					}
					const jpeg = await sharp(await image.loadStillPng(1280))
						.resize(1280, 720)
						.jpeg({ quality: 90 })
						.toBuffer()
					const prompt = await buildChapterPictureVideoPrompt(
						region.effect,
						[region.left, region.top, region.right, region.bottom].join(", "),
					)
					signal?.throwIfAborted()
					const generated = await generateChapterPictureVideo({
						jpeg,
						prompt,
						apiKey,
						signal,
						onSubmit: () => {
							wasSubmitted = true
						},
						recordCost: allowance.platformPays
							? undefined
							: (dollars) => recordPictureAnimationCost(plan.episode, dollars),
					})
					return await screenGeneratedAnimation(generated.video, directory, plan.episode, plan.position, signal)
				} catch (error) {
					// A submitted request may be billable even when the provider response or local processing fails.
					if (!wasSubmitted) {
						await releaseTopicVideoAnimation(allowance.id)
					}
					throw error
				}
			},
			signal,
		)
		if (!bytes) {
			return
		}

		// Bind the selected source and reuse the existing montage's camera, cuts and narration.
		const path = join(directory, "generated-picture.mkv")
		await Bun.write(path, bytes)
		for (const [i, entry] of plan.sceneImages.entries()) {
			if (entry.sourceImageHash === region.sourceImageHash && images[i]) {
				images[i].reviewedAnimationPath = path
			}
		}
		console.info("Film generated picture animation", {
			podcastEpisodeId: plan.episode,
			position: String(plan.position),
			sourceImageHash: region.sourceImageHash,
		})
		return region.sourceImageHash
	} catch (error) {
		signal?.throwIfAborted()
		reportError(error, "topic-video", {
			podcastEpisodeId: plan.episode,
			position: String(plan.position),
			step: "picture-animation",
		})
	}
}

/** Removes provider audio and checks all 120 frames before making the loop available to the film. */
export async function prepareSilentPictureAnimation(
	video: Uint8Array,
	directory: string,
	signal?: AbortSignal,
): Promise<Uint8Array> {
	// Restrict the provider file to an MP4 video track. The ordinary chapter verifier checks the delivery format.
	const source = join(directory, "provider-picture.mp4")
	const silent = join(directory, "silent-picture.mp4")
	await Bun.write(source, video)
	await runFfmpeg({
		ffmpegArguments: [
			"-nostdin",
			"-y",
			"-protocol_whitelist",
			"file",
			"-f",
			"mov",
			"-i",
			source,
			"-map",
			"0:v:0",
			"-map_metadata",
			"-1",
			"-an",
			"-c:v",
			"copy",
			silent,
		],
		timeoutMs: 30_000,
		signal,
	})
	await checkVideoSceneOutput(silent, 120, signal)
	return runFfmpeg({
		ffmpegArguments: [
			"-nostdin",
			"-protocol_whitelist",
			"file",
			"-f",
			"mov",
			"-i",
			silent,
			"-map",
			"0:v:0",
			"-c:v",
			"copy",
			"-f",
			"matroska",
			"pipe:1",
		],
		timeoutMs: 30_000,
		signal,
	})
}

// Check representative output frames before making a generated clip available for reuse.
async function screenGeneratedAnimation(
	video: Uint8Array,
	directory: string,
	episode: string,
	position: number,
	signal?: AbortSignal,
): Promise<Uint8Array | null> {
	const silent = await prepareSilentPictureAnimation(video, directory, signal)
	// Screen one frame per second before the completed animation enters the shared cache.
	const jpegBytes = await runFfmpeg({
		ffmpegArguments: [
			"-nostdin",
			"-i",
			join(directory, "silent-picture.mp4"),
			"-vf",
			"fps=1,scale=480:270,tile=3x2",
			"-frames:v",
			"1",
			"-c:v",
			"mjpeg",
			"-f",
			"image2pipe",
			"pipe:1",
		],
		timeoutMs: 30_000,
		signal,
	})
	const accepted = await isGeneratedChapterImageAllowed({
		jpegBytes,
		podcastEpisodeId: episode,
		position: position,
	})
	return accepted ? silent : null
}
