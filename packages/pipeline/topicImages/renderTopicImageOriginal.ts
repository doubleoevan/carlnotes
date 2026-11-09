// the render of an image's original from a scene: the model call, in the house style or as written, and the 3:2
// original it draws

import { renderTopicImage, type TopicImageRenderResult } from "@carlnotes/models/topicImageModel"
import { type TopicImageOriginal, toTopicImageOriginal } from "./topicImageFiles"
import { toTopicImagePrompt } from "./writeTopicImageScene"

// why a render drew nothing: a spent budget, a rejection, or a failure worth another attempt
export type TopicImageRenderFailureOutcome = Exclude<TopicImageRenderResult["outcome"], "rendered">

// a render that drew nothing, with its outcome and the reason
export class TopicImageRenderFailure extends Error {
	readonly outcome: TopicImageRenderFailureOutcome

	constructor(outcome: TopicImageRenderFailureOutcome, reason: string) {
		super(reason)
		this.outcome = outcome
	}
}

// the scene to draw, whether the house style follows it, the model that draws it, and the key the render bills, or the
// master key if no key is given
export type RenderTopicImageOriginalOptions = {
	scene: string
	isHouseStyle: boolean
	model: string
	litellmApiKey?: string
}

/**
 * Draws an image from the scene, followed by the house style if asked, and returns its original at 3:2. A render that drew nothing throws
 * a TopicImageRenderFailure with why.
 */
export async function renderTopicImageOriginal({
	scene,
	isHouseStyle,
	model,
	litellmApiKey,
}: RenderTopicImageOriginalOptions): Promise<TopicImageOriginal> {
	const renderResult = await renderTopicImage({
		prompt: isHouseStyle ? await toTopicImagePrompt(scene) : scene,
		model,
		litellmApiKey,
	})
	if (renderResult.outcome !== "rendered") {
		throw new TopicImageRenderFailure(renderResult.outcome, renderResult.reason)
	}
	return toTopicImageOriginal(renderResult.imageBytes)
}
