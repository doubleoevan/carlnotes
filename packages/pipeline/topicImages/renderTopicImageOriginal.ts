// the render of an image's original from a scene: the model call, in the house style or as written, and the original
// it draws in its format

import { renderTopicImage, type TopicImageRenderResult } from "@carlnotes/models/topicImageModel"
import {
	TOPIC_IMAGE_FORMAT,
	type TopicImageFormat,
	type TopicImageOriginal,
	toTopicImageOriginal,
} from "./topicImageFiles"
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

// the scene to draw, whether the house style follows it, the model that draws it, the format it is drawn in, which is
// the topic image's if none is given, and the key the render bills, or the master key if no key is given
export type RenderTopicImageOriginalOptions = {
	scene: string
	isHouseStyle: boolean
	model: string
	format?: TopicImageFormat
	litellmApiKey?: string
}

/**
 * Draws an image from the scene, followed by the format's house style if asked, and returns its original in the
 * format. A render that drew nothing throws a TopicImageRenderFailure with why.
 */
export async function renderTopicImageOriginal({
	scene,
	isHouseStyle,
	model,
	format = TOPIC_IMAGE_FORMAT,
	litellmApiKey,
}: RenderTopicImageOriginalOptions): Promise<TopicImageOriginal> {
	const renderResult = await renderTopicImage({
		prompt: isHouseStyle ? await toTopicImagePrompt(scene, format.stylePromptName) : scene,
		model,
		aspectRatio: format.aspectRatio,
		drawSize: format.drawSize,
		litellmApiKey,
	})
	if (renderResult.outcome !== "rendered") {
		throw new TopicImageRenderFailure(renderResult.outcome, renderResult.reason)
	}
	return toTopicImageOriginal(renderResult.imageBytes, format)
}
