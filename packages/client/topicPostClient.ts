// the api client for Topic Posts: one post's read, a draft's create and saves, the publish, the delete, the image's
// regenerate and upload, a body image's upload, and a post's place among its author's profile pins and the home's pins. a Topic's posts
// come with its page
import { regenerateTopicImageResponse, uploadTopicImageResponse } from "@carlnotes/contracts/topicImages"
import {
	type TopicPostBodyImageUploadResponse,
	topicPostBodyImageUploadResponse,
} from "@carlnotes/contracts/topicPostBodyImages"
import {
	type HomeTopicPostsResponse,
	homeTopicPostsResponse,
	type TopicPostResponse,
	type TopicPostSavePayload,
	type TopicPostSaveResult,
	type TopicPostWriteFailure,
	type TopicPostWriteResult,
	topicPostConflictResponse,
	topicPostDiscussionRegenerateResponse,
	topicPostResponse,
	topicPostSaveResponse,
} from "@carlnotes/contracts/topicPosts"
import { type ApiResponse, apiClient, fetchApi, readApiErrorMessage, readApiResponse } from "./apiClient"
import type { UploadedTopicImage } from "./topicImageClient"

// the failure of a write whose request never arrived
const UNSENT_WRITE_FAILURE = { status: "failed", message: null } as const

/**
 * Fetches one Topic Post, or null for one that is missing or that the caller may not read. Any other failed read
 * throws an error.
 */
export async function fetchTopicPost(topicPostId: string): Promise<TopicPostResponse | null> {
	// a draft and a private Topic's post read as missing
	const response = await apiClient().api["topic-posts"][":id"].$get({ param: { id: topicPostId } })
	if (response.status === 404) {
		return null
	}

	// any other failed read is an error
	if (!response.ok) {
		throw new Error(`topic post read failed: ${response.status}`)
	}
	return readApiResponse(topicPostResponse, response)
}

/**
 * Creates a draft on a Topic. Returns the draft as its author reads it, or why none was created.
 */
export function createTopicPostDraft(topicId: string): Promise<TopicPostWriteResult> {
	return toTopicPostWriteResult(() => apiClient().api.topics[":id"]["topic-posts"].$post({ param: { id: topicId } }))
}

/**
 * Saves a Topic Post's title and body at the version its editor opened at. Returns the stored version, or why nothing
 * was saved.
 */
export async function saveTopicPost(
	topicPostId: string,
	topicPostSavePayload: TopicPostSavePayload,
): Promise<TopicPostSaveResult> {
	// a thrown fetch error reads as a failed save
	try {
		const response = await apiClient().api["topic-posts"][":id"].$put({
			param: { id: topicPostId },
			json: topicPostSavePayload,
		})
		if (!response.ok) {
			return await toTopicPostWriteFailure(response)
		}

		// a kept save comes back with the version it is stored at
		return { status: "saved", version: (await readApiResponse(topicPostSaveResponse, response)).version }
	} catch {
		return UNSENT_WRITE_FAILURE
	}
}

/**
 * Publishes a draft. Returns the published post, or why it stayed a draft.
 */
export function publishTopicPost(topicPostId: string): Promise<TopicPostWriteResult> {
	return toTopicPostWriteResult(() =>
		apiClient().api["topic-posts"][":id"].publish.$post({ param: { id: topicPostId } }),
	)
}

/**
 * Deletes a Topic Post, and returns whether it is gone.
 */
export async function deleteTopicPost(topicPostId: string): Promise<boolean> {
	// a thrown fetch error reads as a failed delete
	try {
		const response = await apiClient().api["topic-posts"][":id"].$delete({ param: { id: topicPostId } })
		return response.ok
	} catch {
		return false
	}
}

/**
 * Sets a Topic Post's position among the Topic Posts its author pinned to their profile. Position zero clears it.
 * Throws an error on a rejected write.
 */
export async function sendTopicPostProfileOrder(topicPostId: string, position: number): Promise<void> {
	const response = await apiClient().api["topic-posts"][":id"]["profile-order"].$patch({
		param: { id: topicPostId },
		json: { position },
	})
	if (!response.ok) {
		throw new Error(`topic post profile order update failed: ${response.status}`)
	}
}

/**
 * Sets a Topic Post's position among the home Topic Posts, admin only. Position zero clears it. Throws an error on a
 * rejected write.
 */
export async function sendTopicPostHomeOrder(topicPostId: string, position: number): Promise<void> {
	const response = await apiClient().api["topic-posts"][":id"]["home-order"].$patch({
		param: { id: topicPostId },
		json: { position },
	})
	if (!response.ok) {
		throw new Error(`topic post home order update failed: ${response.status}`)
	}
}

/**
 * Fetches the Topic Posts an admin orders on the home: the pinned ones in their order, and the ones a pin may name.
 * Throws an error on a failed read.
 */
export async function fetchHomeTopicPosts(): Promise<HomeTopicPostsResponse> {
	const response = await apiClient().api.home["topic-posts"].$get()
	if (!response.ok) {
		throw new Error(`home topic posts load failed: ${response.status}`)
	}
	return readApiResponse(homeTopicPostsResponse, response)
}

/**
 * Starts a fresh render of a Topic Post's image, from an optional image prompt. Returns the render's id. Throws an
 * error with the api's words on a rejection.
 */
export async function sendTopicPostImageRegeneration(topicPostId: string, imagePrompt?: string): Promise<string> {
	const response = await apiClient().api["topic-posts"][":id"].image.regenerate.$post({
		param: { id: topicPostId },
		json: imagePrompt ? { imagePrompt } : {},
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `regenerate failed: ${response.status}`)
	}
	return (await readApiResponse(regenerateTopicImageResponse, response)).renderId
}

/**
 * Starts a fresh recording of a Topic Post's discussion, with an optional note for the hosts. Returns the recording's
 * id. Throws an error with the api's words on a rejection.
 */
export async function sendTopicPostDiscussionRegeneration(topicPostId: string, hint?: string): Promise<string> {
	const response = await apiClient().api["topic-posts"][":id"].discussion.regenerate.$post({
		param: { id: topicPostId },
		json: hint ? { hint } : {},
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `regenerate failed: ${response.status}`)
	}
	return (await readApiResponse(topicPostDiscussionRegenerateResponse, response)).discussionId
}

/**
 * Uploads an image in place of a Topic Post's current one. Returns the new image's urls, and whether the upload is
 * unchecked. Throws an error with the api's words on a rejection.
 */
export async function uploadTopicPostImageBody(topicPostId: string, body: FormData): Promise<UploadedTopicImage> {
	const response = await fetchApi(`/api/topic-posts/${encodeURIComponent(topicPostId)}/image`, {
		method: "POST",
		body,
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `upload failed: ${response.status}`)
	}
	return readApiResponse(uploadTopicImageResponse, response)
}

/**
 * Uploads an image for a Topic Post's body. Returns the url to insert and its size. Throws an error with the api's
 * words on a rejection. An upload the caller abandons is aborted through its signal.
 */
export async function uploadTopicPostBodyImage(
	topicPostId: string,
	body: FormData,
	signal?: AbortSignal,
): Promise<TopicPostBodyImageUploadResponse> {
	const response = await fetchApi(`/api/topic-posts/${encodeURIComponent(topicPostId)}/body-images`, {
		method: "POST",
		body,
		signal,
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `upload failed: ${response.status}`)
	}
	return readApiResponse(topicPostBodyImageUploadResponse, response)
}

// a write that returns the post: the post as stored, the failure its response means, or the failure of a request that
// never arrived
async function toTopicPostWriteResult(sendRequest: () => Promise<ApiResponse>): Promise<TopicPostWriteResult> {
	try {
		const response = await sendRequest()
		if (!response.ok) {
			return await toTopicPostWriteFailure(response)
		}

		// the post as the write left it
		return { status: "saved", topicPost: await readApiResponse(topicPostResponse, response) }
	} catch {
		return UNSENT_WRITE_FAILURE
	}
}

// why a rejected write changed nothing, read from its status and its body
async function toTopicPostWriteFailure(response: ApiResponse): Promise<TopicPostWriteFailure> {
	// a 409 is a newer version with its number
	if (response.status === 409) {
		const conflict = await readApiResponse(topicPostConflictResponse, response)
		return { status: "conflict", version: conflict.version ?? null }
	}

	// a post short of a title or of its words, and any other rejection with what its body says
	const message = (await readApiErrorMessage(response)) ?? null
	return message === "incomplete" ? { status: "incomplete" } : { status: "failed", message }
}
