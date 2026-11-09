// topic image render activities: the scene call, the image call with its store, the resize pass, and the failure
// write. they run in the worker process, not the sandbox

import { getAttachmentBytes } from "@carlnotes/db/store"
import { loadTopicImage } from "@carlnotes/db/topicImages"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { isBudgetRejection } from "@carlnotes/models/models"
import { topicImageCostDollars } from "@carlnotes/models/topicImageModel"
import {
	renderTopicImageOriginal,
	TopicImageRenderFailure,
} from "@carlnotes/pipeline/topicImages/renderTopicImageOriginal"
import {
	storeTopicImageFiles,
	toTopicImageFileKey,
	toTopicImageFiles,
	toTopicImageOriginalKey,
	uploadDerivedImageFiles,
} from "@carlnotes/pipeline/topicImages/topicImageFiles"
import {
	loadTopicImageRender,
	loadTopicImageSceneInput,
	recordTopicImageScene,
	replaceTopicImage,
} from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { writeTopicImageScene } from "@carlnotes/pipeline/topicImages/writeTopicImageScene"
import { trackEvent } from "@carlnotes/server/analytics"
import { ApplicationFailure } from "@temporalio/activity"

// the failed close of a render row is the pipeline's own write, registered as an activity as it is
export { failTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"

// the render row and the owner's image prompt
type WriteTopicImageSceneForRenderOptions = { renderId: string; imagePrompt?: string }

/**
 * Writes the render's scene from its topic's words and the owner's image prompt, and keeps it on the render row. A spent budget fails for good.
 */
export async function writeTopicImageSceneForRender({
	renderId,
	imagePrompt,
}: WriteTopicImageSceneForRenderOptions): Promise<string> {
	// the render row names the topic and the key, and a scene already written is reused
	const render = await loadTopicImageRenderOrThrow(renderId)
	if (render.scene) {
		return render.scene
	}
	const sceneInput = await loadTopicImageSceneInput(render.topicId)
	if (!sceneInput) {
		throw ApplicationFailure.nonRetryable(`topic ${render.topicId} not found`, "TopicNotFound")
	}

	// write on the user's key, or the master key for the platform
	try {
		const scene = await writeTopicImageScene({
			...sceneInput,
			imagePrompt,
			litellmApiKey: await loadRenderLitellmApiKey(render.userId),
		})
		await recordTopicImageScene(renderId, scene)
		return scene
	} catch (error) {
		// a spent budget is final until the month resets
		if (isBudgetRejection(error)) {
			throw ApplicationFailure.nonRetryable("the owner's budget is spent", "BudgetSpent")
		}
		throw error
	}
}

// the render row, the scene it draws, and the owner's image prompt, which replaces the house style
type RenderAndStoreTopicImageOptions = { renderId: string; scene: string; imagePrompt?: string }

/**
 * Draws the render's image from the scene, in the house style unless the owner gave an image prompt, stores its original and sizes, and makes it the topic's
 * current image. A rejection or a spent budget fails for good, and anything else is worth another attempt.
 */
export async function renderAndStoreTopicImage({
	renderId,
	scene,
	imagePrompt,
}: RenderAndStoreTopicImageOptions): Promise<void> {
	// a render that already succeeded, on a retried activity, has nothing left to do
	const render = await loadTopicImageRenderOrThrow(renderId)
	if (render.status === "succeeded") {
		return
	}
	// the original at 3:2 from the scene, in the house style if asked, on the render's key. a spent budget and a rejection fail
	// for good, and a retryable failure throws for another attempt
	const model = render.model ?? ""
	const original = await renderTopicImageOriginal({
		scene,
		isHouseStyle: !imagePrompt,
		model,
		litellmApiKey: await loadRenderLitellmApiKey(render.userId),
	}).catch((error: unknown) => {
		throw toRenderActivityFailure(error)
	})

	// the files under the original's hash, then the row that makes it current
	const hash = await storeTopicImageFiles(render.topicId, original)
	await replaceTopicImage({
		topicId: render.topicId,
		renderId,
		hash,
		origin: "generated",
		scene,
		model,
		imagePrompt: imagePrompt ?? null,
		width: original.width,
		height: original.height,
		costDollars: topicImageCostDollars(model),
	})

	// the event names the topic and the render's kind, and the owner flag says whether the user it bills owns the topic
	if (render.userId) {
		trackEvent(render.kind === "regenerate" ? "topic_image_regenerate" : "topic_image_generate", render.userId, {
			topicId: render.topicId,
			renderKind: render.kind,
			isOwner: render.topicOwnerId === render.userId,
			entryPoint: "worker",
		})
	}
}

/**
 * Derives a topic's six files again from its stored original, under the same hash. A topic with no image is skipped.
 */
export async function rederiveTopicImageFiles(topicId: string): Promise<void> {
	// the current original, then each file written over its old copy
	const topicImage = await loadTopicImage(topicId)
	if (!topicImage) {
		return
	}

	// the files derive from the stored original and land under the same hash
	const originalJpeg = await getAttachmentBytes(toTopicImageOriginalKey(topicId, topicImage.hash))
	const derivedFiles = await toTopicImageFiles(originalJpeg)
	await uploadDerivedImageFiles((fileName) => toTopicImageFileKey(topicId, topicImage.hash, fileName), derivedFiles)
}

// the render row, a missing row throws without a retry
async function loadTopicImageRenderOrThrow(
	renderId: string,
): Promise<NonNullable<Awaited<ReturnType<typeof loadTopicImageRender>>>> {
	const render = await loadTopicImageRender(renderId)
	if (!render) {
		throw ApplicationFailure.nonRetryable(`topic image render ${renderId} not found`, "RenderNotFound")
	}
	return render
}

// the key a render bills: the user's own, or the master key for a render the platform pays for
async function loadRenderLitellmApiKey(userId: string | null): Promise<string | undefined> {
	return userId ? loadOrProvisionUserLiteLLMKey(userId) : undefined
}

// the activity failure that a render with no image throws
function toRenderActivityFailure(error: unknown): unknown {
	// a spent budget and a rejection fail for good
	if (error instanceof TopicImageRenderFailure && error.outcome === "budget-spent") {
		return ApplicationFailure.nonRetryable(error.message, "BudgetSpent")
	}
	if (error instanceof TopicImageRenderFailure && error.outcome === "rejected") {
		return ApplicationFailure.nonRetryable(error.message, "RenderRejected")
	}

	// a timeout, a rate limit, or a server failure is worth another attempt
	return error
}
