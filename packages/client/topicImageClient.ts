// the typed api client for a topic's image. an editor's regenerate, the render it polls, and the upload

import {
	regenerateTopicImageResponse,
	type TopicImageRenderResponse,
	type TopicImageUrls,
	topicImageRenderResponse,
	uploadTopicImageResponse,
} from "@carlnotes/contracts/topicImages"
import { apiClient, fetchApi, readApiErrorMessage, readApiResponse } from "./apiClient"

/**
 * Starts a fresh render of a topic's image, from the owner's image prompt if there is one. Returns the render's id to poll.
 * Throws an error naming the rejection, which the month's limit is one of.
 */
export async function sendTopicImageRegeneration(topicId: string, imagePrompt?: string): Promise<string> {
	const response = await apiClient().api.topics[":id"].image.regenerate.$post({
		param: { id: topicId },
		json: imagePrompt ? { imagePrompt } : {},
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `regenerate failed: ${response.status}`)
	}
	return (await readApiResponse(regenerateTopicImageResponse, response)).renderId
}

/**
 * Returns where a render stands, with the topic's image once it succeeded.
 */
export async function fetchTopicImageRender(renderId: string): Promise<TopicImageRenderResponse> {
	const response = await apiClient().api["topic-image-renders"][":id"].$get({ param: { id: renderId } })
	if (!response.ok) {
		throw new Error(`render read failed: ${response.status}`)
	}
	return readApiResponse(topicImageRenderResponse, response)
}

// an uploaded image as its uploader sees it: its urls, and whether it is shown to them alone until its image
// moderation can run
export type UploadedTopicImage = { image: TopicImageUrls; isImageUnchecked?: boolean }

/**
 * Uploads a topic's own image encoded by a browser or native file picker as the form's image field. Returns the
 * image's urls, which replace the current ones at once, and whether the upload is unchecked.
 */
export async function uploadTopicImageBody(topicId: string, body: FormData): Promise<UploadedTopicImage> {
	const response = await fetchApi(`/api/topics/${topicId}/image`, { method: "POST", body })
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `upload failed: ${response.status}`)
	}
	return readApiResponse(uploadTopicImageResponse, response)
}
