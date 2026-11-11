// topic image render activities: the scene call, the image call with its store, the resize pass, and the failure
// write. they run in the worker process, not the sandbox

import { getAttachmentBytes } from "@carlnotes/db/store"
import { loadTopicImage } from "@carlnotes/db/topicImages"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { isBudgetRejection } from "@carlnotes/models/models"
import { topicImageCostDollars } from "@carlnotes/models/topicImageModel"
import {
	loadPodcastEpisodeImageSceneInput,
	replacePodcastEpisodeImage,
} from "@carlnotes/pipeline/podcast/podcastEpisodeImageRenders"
import {
	renderTopicImageOriginal,
	TopicImageRenderFailure,
} from "@carlnotes/pipeline/topicImages/renderTopicImageOriginal"
import {
	storePodcastEpisodeImageFiles,
	storeTopicImageFiles,
	storeTopicPostImageFiles,
	type TopicImageOriginal,
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
	type TopicImageRenderRow,
} from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { writeTopicImageScene } from "@carlnotes/pipeline/topicImages/writeTopicImageScene"
import {
	loadTopicPodcastEpisodeVideoImageSceneInput,
	replaceTopicPodcastEpisodeVideoImage,
	TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT,
} from "@carlnotes/pipeline/topicPodcastEpisodeVideo/topicPodcastEpisodeVideoImage"
import {
	loadTopicPostImageSceneInput,
	replaceTopicPostImage,
} from "@carlnotes/pipeline/topicPosts/topicPostImageRenders"
import { trackEvent } from "@carlnotes/server/analytics"
import { ApplicationFailure } from "@temporalio/activity"

// the failed close of a render row is the pipeline's own write, registered as an activity as it is
export { failTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"

// the render row and the owner's image prompt
type WriteTopicImageSceneForRenderOptions = { renderId: string; imagePrompt?: string }

/**
 * Writes the render's scene from its film's, its podcast episode's, its Topic Post's, or its topic's words and the
 * editor's image prompt, and keeps it on the render row. A spent budget fails for good.
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

	// load the scene's words from the film, the podcast episode, or the Topic Post the render draws, else from the topic
	const sceneInput = await loadRenderSceneInput(render)
	if (!sceneInput) {
		throw ApplicationFailure.nonRetryable(`the render ${renderId} has nothing to draw`, "SceneInputNotFound")
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

// what a render's scene is written from: its film's podcast episode's words in the film's framing, its podcast
// episode's words, its Topic Post's, or its topic's
function loadRenderSceneInput(render: TopicImageRenderRow): ReturnType<typeof loadTopicImageSceneInput> {
	if (render.topicPodcastEpisodeVideoId) {
		return loadTopicPodcastEpisodeVideoImageSceneInput(render.topicPodcastEpisodeVideoId)
	}

	// a podcast episode's own words, then a Topic Post's, then the topic's
	if (render.podcastEpisodeId) {
		return loadPodcastEpisodeImageSceneInput(render.podcastEpisodeId)
	}
	return render.topicPostId
		? loadTopicPostImageSceneInput(render.topicPostId)
		: loadTopicImageSceneInput(render.topicId)
}

// the render row, the scene it draws, and the owner's image prompt, which replaces the house style of every image but
// a film's
type RenderAndStoreTopicImageOptions = { renderId: string; scene: string; imagePrompt?: string }

/**
 * Draws the render's image from the scene, in the house style unless the editor gave an image prompt, stores it, and
 * makes it the current image of its film, its podcast episode, its Topic Post, or its topic. A film's image keeps the
 * film house style after an image prompt too, which leaves its dark lower third clear for the film's title. A
 * rejection or a spent budget fails for good, and anything else is worth another attempt.
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
	// the original from the scene, wide and always in the film house style for a film, and at 3:2 in the house style
	// if asked for any other image, on the render's key. a spent budget and a rejection fail for good, and a retryable
	// failure throws for another attempt
	const model = render.model ?? ""
	const isTopicPodcastEpisodeVideoImage = Boolean(render.topicPodcastEpisodeVideoId)
	const original = await renderTopicImageOriginal({
		scene,
		isHouseStyle: isTopicPodcastEpisodeVideoImage || !imagePrompt,
		model,
		format: isTopicPodcastEpisodeVideoImage ? TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT : undefined,
		litellmApiKey: await loadRenderLitellmApiKey(render.userId),
	}).catch((error: unknown) => {
		throw toRenderActivityFailure(error)
	})

	// store the original and make it the current image of whatever the render drew, then record the event
	await storeRenderedImage({
		render,
		original,
		scene,
		model,
		imagePrompt,
		costDollars: topicImageCostDollars(model),
	})
	trackRenderEvent(render)
}

// the render row, the original it drew, the scene, the model, and the editor's image prompt that the topic's own image
// row keeps, and what the render cost
type StoreRenderedImageOptions = {
	render: TopicImageRenderRow
	original: TopicImageOriginal
	scene: string
	model: string
	imagePrompt?: string
	costDollars: number
}

// store the original's files and make it the current image of the render's film, podcast episode, Topic Post, or topic
async function storeRenderedImage({
	render,
	original,
	scene,
	model,
	imagePrompt,
	costDollars,
}: StoreRenderedImageOptions): Promise<void> {
	// a film render stores its file beside the film's parts, makes it the film's image, and starts the film's rebuild
	const { id: renderId, podcastEpisodeId, topicPostId } = render
	if (render.topicPodcastEpisodeVideoId) {
		const imageHash = await replaceTopicPodcastEpisodeVideoImage({
			topicPodcastEpisodeVideoId: render.topicPodcastEpisodeVideoId,
			original,
			renderId,
			origin: "generated",
			imagePrompt: imagePrompt ?? null,
			costDollars,
		})

		// a film removed meanwhile has no image to replace
		if (!imageHash) {
			throw ApplicationFailure.nonRetryable(
				`the film of render ${renderId} is gone`,
				"TopicPodcastEpisodeVideoNotFound",
			)
		}
		return
	}

	// a podcast episode render stores its files under the podcast episode and makes them the podcast episode's image
	if (podcastEpisodeId) {
		const hash = await storePodcastEpisodeImageFiles(podcastEpisodeId, original)
		await replacePodcastEpisodeImage({
			podcastEpisodeId,
			renderId,
			hash,
			origin: "generated",
			imagePrompt: imagePrompt ?? null,
			costDollars,
		})
		return
	}

	// a Topic Post render stores its files under the post and makes them the post's image
	if (topicPostId) {
		const hash = await storeTopicPostImageFiles(topicPostId, original)
		await replaceTopicPostImage({
			topicPostId,
			renderId,
			hash,
			origin: "generated",
			imagePrompt: imagePrompt ?? null,
			costDollars,
		})
		return
	}

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
		costDollars,
	})
}

// track the render's event with the topic, the podcast episode, the Topic Post, or the film if the render drew one,
// and the render's kind. the owner flag says whether the user the render bills owns the topic
function trackRenderEvent(render: TopicImageRenderRow): void {
	// a Topic Post's regenerate has its own event, named by the post
	if (render.userId && render.topicPostId && render.kind === "regenerate") {
		trackEvent("social_topic_post_image_regenerate", render.userId, {
			objectId: render.topicPostId,
			topicId: render.topicId,
			isOwner: render.topicOwnerId === render.userId,
			entryPoint: "worker",
		})
		return
	}
	if (render.userId) {
		trackEvent(render.kind === "regenerate" ? "topic_image_regenerate" : "topic_image_generate", render.userId, {
			topicId: render.topicId,
			...(render.podcastEpisodeId ? { podcastEpisodeId: render.podcastEpisodeId } : {}),
			...(render.topicPostId ? { topicPostId: render.topicPostId } : {}),
			...(render.topicPodcastEpisodeVideoId ? { topicPodcastEpisodeVideoId: render.topicPodcastEpisodeVideoId } : {}),
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
async function loadTopicImageRenderOrThrow(renderId: string): Promise<TopicImageRenderRow> {
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
